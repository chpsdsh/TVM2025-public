import { Expr } from "../../lab04";
import { cost } from "./cost";

const MAX_STEPS = 5000;
const COST_LIMIT = 2;


function eq(a: Expr, b: Expr): boolean {
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
        case "Num": return (b as any).value === a.value;
        case "Var": return (b as any).name === a.name;
        case "Neg": return eq(a.expr, (b as any).expr);
        default: return eq(a.left, (b as any).left) && eq(a.right, (b as any).right);
    }
}

function keyOf(e: Expr): string {
    switch (e.kind) {
        case "Num": return `#${e.value}`;
        case "Var": return `$${e.name}`;
        case "Neg": return `~(${keyOf(e.expr)})`;
        case "Add": return `(${keyOf(e.left)}+${keyOf(e.right)})`;
        case "Sub": return `(${keyOf(e.left)}-${keyOf(e.right)})`;
        case "Mul": return `(${keyOf(e.left)}*${keyOf(e.right)})`;
        case "Div": return `(${keyOf(e.left)}/${keyOf(e.right)})`;
    }
}

type Env = Map<string, Expr>;

function matchPattern(pattern: Expr, expr: Expr, env: Env = new Map()): Env | null {
    switch (pattern.kind) {
        case "Num":
            return (expr.kind === "Num" && expr.value === pattern.value) ? env : null;

        case "Var": {
            const bound = env.get(pattern.name);
            if (!bound) { env.set(pattern.name, expr); return env; }
            return eq(bound, expr) ? env : null;
        }

        case "Neg":
            if (expr.kind !== "Neg") return null;
            return matchPattern(pattern.expr, expr.expr, env);

        default:
            if (expr.kind !== pattern.kind) return null;
            const envL = matchPattern(pattern.left, expr.left, env);
            return envL ? matchPattern(pattern.right, expr.right, envL) : null;
    }
}

function substitute(tpl: Expr, env: Env): Expr {
    switch (tpl.kind) {
        case "Num": return { kind: "Num", value: tpl.value };
        case "Var": return env.get(tpl.name) ?? { kind: "Var", name: tpl.name };
        case "Neg": return { kind: "Neg", expr: substitute(tpl.expr, env) };
        case "Add": return { kind: "Add", left: substitute(tpl.left, env), right: substitute(tpl.right, env) };
        case "Sub": return { kind: "Sub", left: substitute(tpl.left, env), right: substitute(tpl.right, env) };
        case "Mul": return { kind: "Mul", left: substitute(tpl.left, env), right: substitute(tpl.right, env) };
        case "Div": return { kind: "Div", left: substitute(tpl.left, env), right: substitute(tpl.right, env) };
    }
}

function constFold(e: Expr): Expr {
    switch (e.kind) {
        case "Neg": {
            const a = constFold(e.expr);
            if (a.kind === "Num") return { kind: "Num", value: -a.value };
            return { kind: "Neg", expr: a };
        }
        case "Add":
        case "Sub":
        case "Mul":
        case "Div": {
            const L = constFold(e.left);
            const R = constFold(e.right);
            if (L.kind === "Num" && R.kind === "Num") {
                switch (e.kind) {
                    case "Add": return { kind: "Num", value: L.value + R.value };
                    case "Sub": return { kind: "Num", value: L.value - R.value };
                    case "Mul": return { kind: "Num", value: L.value * R.value };
                    case "Div": return (R.value !== 0)
                        ? { kind: "Num", value: Math.trunc(L.value / R.value) }
                        : { kind: "Div", left: L, right: R };
                }
            }
            return { kind: e.kind, left: L, right: R } as Expr;
        }
        default: return e;
    }
}

function canonicalLocal(e: Expr): Expr {
    switch (e.kind) {
        case "Neg": {
            const a = canonicalLocal(e.expr);
            if (a.kind === "Neg") return a.expr;                 
            if (a.kind === "Num") return { kind: "Num", value: -a.value };
            return { kind: "Neg", expr: a };
        }
        case "Add": {
            const L = canonicalLocal(e.left);
            const R = canonicalLocal(e.right);
            if (L.kind === "Num" && L.value === 0) return R;       
            if (R.kind === "Num" && R.value === 0) return L;       
            return { kind: "Add", left: L, right: R };
        }
        case "Sub": {
            const L = canonicalLocal(e.left);
            const R = canonicalLocal(e.right);
            if (R.kind === "Num" && R.value === 0) return L;      
            if (eq(L, R)) return { kind: "Num", value: 0 };     
            return { kind: "Sub", left: L, right: R };
        }
        case "Mul": {
            const L = canonicalLocal(e.left);
            const R = canonicalLocal(e.right);
            if ((L.kind === "Num" && L.value === 0) || (R.kind === "Num" && R.value === 0))
                return { kind: "Num", value: 0 };                    
            if (L.kind === "Num" && L.value === 1) return R;      
            if (R.kind === "Num" && R.value === 1) return L;       
            return { kind: "Mul", left: L, right: R };
        }
        case "Div": {
            const L = canonicalLocal(e.left);
            const R = canonicalLocal(e.right);
            if (R.kind === "Num" && R.value === 1) return L;       
            return { kind: "Div", left: L, right: R };
        }
        default: return e;
    }
}

function normalize(e: Expr): Expr {
    return constFold(canonicalLocal(e));
}

type Rebuilder = (replacement: Expr) => Expr;

function contextsList(e: Expr): Array<[Expr, Rebuilder]> {
    const out: Array<[Expr, Rebuilder]> = [];

    out.push([e, (r: Expr) => r]);

    switch (e.kind) {
        case "Num":
        case "Var":
            return out;

        case "Neg": {
            const sub = contextsList(e.expr);
            for (const [s, rebuild] of sub) {
                out.push([s, (r: Expr) => rebuild({ kind: "Neg", expr: r })]);
            }
            return out;
        }

        case "Add":
        case "Sub":
        case "Mul":
        case "Div": {
            const lefts = contextsList(e.left);
            for (const [s, rebuild] of lefts) {
                out.push([s, (r: Expr) => {
                    switch (e.kind) {
                        case "Add": return rebuild({ kind: "Add", left: r, right: e.right });
                        case "Sub": return rebuild({ kind: "Sub", left: r, right: e.right });
                        case "Mul": return rebuild({ kind: "Mul", left: r, right: e.right });
                        case "Div": return rebuild({ kind: "Div", left: r, right: e.right });
                    }
                }]);
            }
            const rights = contextsList(e.right);
            for (const [s, rebuild] of rights) {
                out.push([s, (r: Expr) => {
                    switch (e.kind) {
                        case "Add": return rebuild({ kind: "Add", left: e.left, right: r });
                        case "Sub": return rebuild({ kind: "Sub", left: e.left, right: r });
                        case "Mul": return rebuild({ kind: "Mul", left: e.left, right: r });
                        case "Div": return rebuild({ kind: "Div", left: e.left, right: r });
                    }
                }]);
            }
            return out;
        }
    }
}

function neighborsList(cur: Expr, rules: [Expr, Expr][]): Expr[] {
    const out: Expr[] = [];
    const N = normalize(cur);

    for (const [lhs, rhs] of rules) {
        const ctxs = contextsList(N);
        for (const [sub, rebuild] of ctxs) {
            const env = matchPattern(lhs, sub);
            if (env) {
                const repl = substitute(rhs, env);
                out.push(normalize(rebuild(repl)));
            }
        }
    }

    return out;
}

export function simplify(e: Expr, identities: [Expr, Expr][]): Expr {

    const rules: [Expr, Expr][] = identities.concat(
        identities.map(([L, R]) => [R, L] as [Expr, Expr])
    );

    const seen = new Set<string>();
    const q: Expr[] = [e];

    let best = e;
    let bestCost = cost(e);

    let steps = 0;
    while (q.length && steps < MAX_STEPS) {
        steps++;

        const cur = q.shift()!;
        const k = keyOf(cur);
        if (seen.has(k)) continue;
        seen.add(k);

        const c = cost(cur);
        if (c < bestCost) { best = cur; bestCost = c; }

        const nexts = neighborsList(cur, rules);
        for (const n of nexts) {
            if (cost(n) > bestCost + COST_LIMIT) continue;
            const kk = keyOf(n);
            if (!seen.has(kk)) q.push(n);
        }
    }
    
    return best;
}
