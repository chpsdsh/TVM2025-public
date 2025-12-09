import { writeFileSync } from "fs";
import { Op, I32, Void, c, BufferedEmitter, LocalEntry } from "../../wasm";
import * as funny from "../../lab08";
import * as arith from "../../lab04";

const {
    i32,
    varuint32,
    get_local,
    local_entry,
    set_local,
    call,
    if_: ifOp,
    void_block,
    void_loop,
    br_if,
    str_ascii,
    export_entry,
    func_type_m,
    function_body,
    type_section,
    function_section,
    export_section,
    code_section,
    memory_section,
    resizable_limits,
    align32,
    external_kind,
} = c;

export { FunnyError } from "../../lab08";

type FuncIndexMap = Map<string, number>;
type LocalEnv = Map<string, number>;

function isArithExpr(e: funny.Expr): e is arith.Expr {
    const k = (e as any).kind;
    return k !== "funccall" && k !== "arraccess";
}

export async function compileModule(
    m: funny.Module,
    name?: string
): Promise<WebAssembly.Exports> {
    const funcs = m.functions;

    const funcIndexByName: FuncIndexMap = new Map();
    funcs.forEach((fn, i) => funcIndexByName.set(fn.name, i));

    const funcTypes = funcs.map((fn) => {
        const paramTypes = fn.parameters.map(() => i32 as I32);
        const resultTypes = fn.returns.map(() => i32 as I32);
        return func_type_m(paramTypes, resultTypes);
    });

    const funcBodies = funcs.map((fn) =>
        compileFunctionBody(fn, funcIndexByName)
    );

    const funcTypeIndices = funcs.map((_fn, i) => varuint32(i));

    const memLimits = resizable_limits(varuint32(1));
    const memSec = memory_section([memLimits]);

    const exports = funcs.map((fn, i) =>
        export_entry(str_ascii(fn.name), external_kind.function, varuint32(i))
    );

    const wasmModule = c.module([
        type_section(funcTypes),
        function_section(funcTypeIndices),
        memSec,
        export_section(exports),
        code_section(funcBodies),
    ]);

    const emitter = new BufferedEmitter(new ArrayBuffer(64 * 1024));
    wasmModule.emit(emitter);
    const bytes = new Uint8Array(emitter.buffer, 0, emitter.length);

    const { instance } = await WebAssembly.instantiate(bytes, {});
    return instance.exports;
}


function compileFunctionBody(
    fn: funny.FunctionDef,
    funcIndexByName: FuncIndexMap
) {
    const params = fn.parameters;
    const rets = fn.returns;
    const locals = fn.locals;

    const paramCount = params.length;
    const retCount = rets.length;
    const localCount = locals.length;

    const totalExtraLocals = retCount + localCount;

    const env: LocalEnv = new Map();

    params.forEach((p, i) => env.set(p.name, i));

    rets.forEach((r, i) => env.set(r.name, paramCount + i));

    locals.forEach((l, i) =>
        env.set(l.name, paramCount + retCount + i)
    );

    const localEntries: LocalEntry[] = [];
    if (totalExtraLocals > 0) {
        localEntries.push(local_entry(varuint32(totalExtraLocals), i32));
    }

    const code: any[] = [];

    compileStmt(fn.body, env, funcIndexByName, code);

    for (const r of rets) {
        const idx = env.get(r.name);
        if (idx === undefined) {
            throw new Error(`Unknown return variable ${r.name}`);
        }
        code.push(get_local(i32, idx));
    }

    return function_body(localEntries, code);
}


function compileStmt(
    stmt: funny.Statement,
    env: LocalEnv,
    funcIndexByName: FuncIndexMap,
    out: any[]
): void {
    switch (stmt.kind) {
        case "assign": {
            const targets = stmt.targets;
            const exprs = stmt.exprs;

            if (targets.length !== exprs.length) {
                throw new Error(
                    "Tuple assignment with multi-valued RHS is not supported in codegen (type checker guarantees arity, но сейчас реализован только случай 1:1)."
                );
            }

            for (let i = 0; i < targets.length; i++) {
                const lv = targets[i];
                const ex = exprs[i];
                const exprOp = compileExpr(ex, env, funcIndexByName);

                if (lv.kind === "lvar") {
                    const idx = env.get(lv.name);
                    if (idx === undefined) {
                        throw new Error(
                            `Assignment to unknown variable ${lv.name}`
                        );
                    }
                    out.push(set_local(idx, exprOp));
                } else if (lv.kind === "larr") {
                    const arrIdx = env.get(lv.name);
                    if (arrIdx === undefined) {
                        throw new Error(
                            `Assignment to unknown array ${lv.name}`
                        );
                    }

                    const basePtr = get_local(i32, arrIdx);
                    const idxOp = compileExpr(
                        lv.index as funny.Expr,
                        env,
                        funcIndexByName
                    );

                    const one = i32.const(1);
                    const four = i32.const(4);
                    const idxPlusOne = i32.add(idxOp, one);
                    const offsetBytes = i32.mul(idxPlusOne, four);
                    const addr = i32.add(basePtr, offsetBytes);

                    const storeOp = i32.store(align32, addr, exprOp);
                    out.push(storeOp);
                } else {
                    throw new Error(
                        `Unknown LValue type ${(lv as any).type}`
                    );
                }
            }
            return;
        }

        case "block": {
            for (const s of stmt.stmts) {
                compileStmt(s, env, funcIndexByName, out);
            }
            return;
        }

        case "if": {
            const condOp = compileCondition(
                stmt.condition,
                env,
                funcIndexByName
            );
            const thenOps: any[] = [];
            compileStmt(stmt.then, env, funcIndexByName, thenOps);

            if (stmt.else) {
                const elseOps: any[] = [];
                compileStmt(stmt.else, env, funcIndexByName, elseOps);
                out.push(ifOp(c.void, condOp, thenOps, elseOps));
            } else {
                out.push(ifOp(c.void, condOp, thenOps));
            }
            return;
        }

        case "while": {
            const loopBody: any[] = [];

            const condOp = compileCondition(
                stmt.condition,
                env,
                funcIndexByName
            );
            const condIsZero = i32.eqz(condOp);

            loopBody.push(br_if(1, condIsZero));

            compileStmt(stmt.body, env, funcIndexByName, loopBody);

            loopBody.push(c.br(0));

            const loopOp = void_loop(loopBody);
            const blockOp = void_block([loopOp]);
            out.push(blockOp);
            return;
        }

        case "expr": {
            compileExpr(stmt.expr, env, funcIndexByName);
            return;
        }

        default:
            throw new Error(
                `Unknown funny.Statement type ${(stmt as any).type}`
            );
    }
}


function compileExpr(
    e: funny.Expr,
    env: LocalEnv,
    funcIndexByName: FuncIndexMap
): Op<I32> {
    if (e.kind === "funccall") {
        const fc = e as funny.FuncCallExpr;

        if (fc.name === "length") {
            if (fc.args.length !== 1) {
                throw new Error("length() expects exactly 1 argument.");
            }
            const arg = fc.args[0] as funny.Expr;

            if ((arg as any).kind === "Var") {
                const arrName = (arg as any).name as string;
                const arrIdx = env.get(arrName);
                if (arrIdx === undefined) {
                    throw new Error(`length(): unknown array variable ${arrName}`);
                }
                const basePtr = get_local(i32, arrIdx);
                return i32.load(align32, basePtr);
            } else {
                throw new Error("length() is only supported on array variables.");
            }
        }

        const fIndex = funcIndexByName.get(fc.name);
        if (fIndex === undefined) {
            throw new Error(`Unknown function "${fc.name}" in codegen.`);
        }

        const argsOps = fc.args.map(a =>
            compileExpr(a as funny.Expr, env, funcIndexByName)
        );

        return call(i32, varuint32(fIndex), argsOps);
    }

    if (e.kind === "arraccess") {
        const aa = e as funny.ArrAccessExpr;
        const arrIdx = env.get(aa.name);
        if (arrIdx === undefined) {
            throw new Error(`Access to unknown array ${aa.name}`);
        }

        const basePtr = get_local(i32, arrIdx);
        const idxOp = compileExpr(
            aa.index as funny.Expr,
            env,
            funcIndexByName
        );

        const one = i32.const(1);
        const four = i32.const(4);
        const idxPlusOne = i32.add(idxOp, one);
        const offsetBytes = i32.mul(idxPlusOne, four);
        const addr = i32.add(basePtr, offsetBytes);

        return i32.load(align32, addr);
    }

    const ae = e;

    switch (ae.kind) {
        case "Num":
            return i32.const(ae.value | 0);

        case "Var": {
            const idx = env.get(ae.name as string);
            if (idx === undefined) {
                throw new Error(`Use of unknown variable ${ae.name}`);
            }
            return get_local(i32, idx);
        }

        case "Neg": {
            const inner = compileExpr(
                ae.expr as funny.Expr,
                env,
                funcIndexByName
            );
            return i32.sub(i32.const(0), inner);
        }

        case "Add": {
            const l = compileExpr(
                ae.left as funny.Expr,
                env,
                funcIndexByName
            );
            const r = compileExpr(
                ae.right as funny.Expr,
                env,
                funcIndexByName
            );
            return i32.add(l, r);
        }

        case "Sub": {
            const l = compileExpr(
                ae.left as funny.Expr,
                env,
                funcIndexByName
            );
            const r = compileExpr(
                ae.right as funny.Expr,
                env,
                funcIndexByName
            );
            return i32.sub(l, r);
        }

        case "Mul": {
            const l = compileExpr(
                ae.left as funny.Expr,
                env,
                funcIndexByName
            );
            const r = compileExpr(
                ae.right as funny.Expr,
                env,
                funcIndexByName
            );
            return i32.mul(l, r);
        }

        case "Div": {
            const l = compileExpr(
                ae.left as funny.Expr,
                env,
                funcIndexByName
            );
            const r = compileExpr(
                ae.right as funny.Expr,
                env,
                funcIndexByName
            );
            return i32.div_s(l, r);
        }

        default:
            throw new Error(`Unknown expression kind: ${ae}`);
    }
}



function compileCondition(
    cond: funny.Condition,
    env: LocalEnv,
    funcIndexByName: FuncIndexMap
): Op<I32> {
    switch (cond.kind) {
        case "true":
            return i32.const(1);

        case "false":
            return i32.const(0);

        case "comparison": {
            const l = compileExpr(cond.left, env, funcIndexByName);
            const r = compileExpr(cond.right, env, funcIndexByName);
            switch (cond.op) {
                case "==":
                    return i32.eq(l, r);
                case "!=":
                    return i32.ne(l, r);
                case "<":
                    return i32.lt_s(l, r);
                case ">":
                    return i32.gt_s(l, r);
                case "<=":
                    return i32.le_s(l, r);
                case ">=":
                    return i32.ge_s(l, r);
                default:
                    throw new Error(
                        `Unknown comparison op ${cond.op}`
                    );
            }
        }

        case "not": {
            const inner = compileCondition(
                cond.condition,
                env,
                funcIndexByName
            );
            return i32.eqz(inner);
        }

        case "and": {
            const l = compileCondition(
                cond.left,
                env,
                funcIndexByName
            );
            const r = compileCondition(
                cond.right,
                env,
                funcIndexByName
            );
            return i32.and(l, r);
        }

        case "or": {
            const l = compileCondition(
                cond.left,
                env,
                funcIndexByName
            );
            const r = compileCondition(
                cond.right,
                env,
                funcIndexByName
            );
            return i32.or(l, r);
        }

        case "paren":
            return compileCondition(
                cond.inner,
                env,
                funcIndexByName
            );

        default:
            throw new Error(
                `Unknown condition kind ${(cond as any).kind}`
            );
    }
}
