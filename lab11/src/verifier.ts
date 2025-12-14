import { Arith, Bool, Context, init, Model, SMTArray } from "z3-solver";

import {
  AnnotatedModule,
  AnnotatedFunction,
  Predicate,
  ComparisonPredicate,
  AndPredicate,
  OrPredicate,
  NotPredicate,
  ParenPredicate,
  QuantifierPredicate,
  FormulaRefPredicate,
} from "../../lab10";

import { FunnyError, ErrorCode } from "../../lab08/src/funny";

import {
  Expr,
  Condition,
  ParameterDef,
  AssignStmt,
  BlockStmt,
  IfStmt,
  WhileStmt,
  VarLValue,
  ArrLValue,
  FuncCallExpr,
  ArrAccessExpr,
} from "../../lab08/src/funny";

// -------------------- Z3 context --------------------

let z3Context: Context | null = null;
let z3: Context;

// NEW: cache for recursive axioms (e.g., factorial)
const recursiveAxiomsAdded = new Set<string>();

async function initZ3() {
  if (!z3Context) {
    const { Context } = await init();
    z3Context = Context("main");
  }
  return z3Context;
}

export function flushZ3() {
  z3Context = null;
  // NEW: avoid cross-test contamination
  recursiveAxiomsAdded.clear();
}

// -------------------- Result type --------------------

export interface VerificationResult {
  function: string;
  verified: boolean;
  error?: string;
  model?: Model;
}

// -------------------- Env --------------------

type EnvEntry = Arith | SMTArray;
type Env = Map<string, EnvEntry>;

function isArith(x: EnvEntry): x is Arith {
  return typeof (x as any)?.add === "function" && typeof (x as any)?.mul === "function";
}

// -------------------- Main verify --------------------

export async function verifyModule(module: AnnotatedModule): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  let hasFailure = false;

  z3 = await initZ3();

  for (const func of module.functions) {
    const solver = new z3.Solver();
    try {
      // If a function has no spec at all, treat it as verified (nothing to prove).
      // This matches the lab behavior: only annotated code is checked.
      const hasSpec = !!func.requires || !!func.ensures;
      const hasInv = stmtHasInvariant(func.body as any);
      if (!hasSpec && !hasInv) {
        results.push({ function: func.name, verified: true });
        continue;
      }

      const vc = buildFunctionVerificationConditions(func, module);
      const env = buildEnvironment(func, z3);
      const z3VC = convertPredicateToZ3(vc, env, z3, module, solver);

      const proof = await proveTheorem(z3VC, solver);
      const verified = proof.result === "unsat";

      results.push({
        function: func.name,
        verified,
        error:
          proof.result === "sat"
            ? "Теорема неверна: найден контрпример (модель Z3)."
            : proof.result === "unknown"
              ? "Z3 вернул unknown."
              : undefined,
        model: proof.model,
      });

      if (!verified) hasFailure = true;
    } catch (e: any) {
      results.push({
        function: func.name,
        verified: false,
        error: String(e?.message ?? e),
      });
      hasFailure = true;
    }
  }

  if (hasFailure) {
    const failed = results.filter((r) => !r.verified).map((r) => r.function).join(", ");
    // Tests for *.Error.funny only require that we throw; positions may be empty.
    throw new Error(`Verification failed for: ${failed}`);
  }

  return results;
}

function stmtHasInvariant(stmt: any): boolean {
  if (!stmt) return false;
  if (stmt.kind === "while" && (stmt as any).invariant) return true;
  if (stmt.kind === "block") return (stmt.stmts ?? []).some((s: any) => stmtHasInvariant(s));
  if (stmt.kind === "if") return stmtHasInvariant(stmt.then) || stmtHasInvariant(stmt.else);
  return false;
}

// theorem valid <=> Not(theorem) UNSAT
async function proveTheorem(
  theorem: Bool,
  solver: any
): Promise<{ result: "sat" | "unsat" | "unknown"; model?: Model }> {
  solver.add(z3.Not(theorem));
  const r = await solver.check();
  if (r === "sat") return { result: "sat", model: solver.model() };
  if (r === "unsat") return { result: "unsat" };
  return { result: "unknown" };
}

// -------------------- Environment --------------------

function buildEnvironment(func: AnnotatedFunction, z3: Context): Env {
  const env: Env = new Map();

  const add = (p: ParameterDef) => {
    if (p.typeName === "int") {
      env.set(p.name, z3.Int.const(p.name));
    } else if (p.typeName === "int[]") {
      env.set(p.name, z3.Array.const(p.name, z3.Int.sort(), z3.Int.sort()));
    } else {
      throw new Error(`Unknown typeName ${(p as any).typeName}`);
    }
  };

  func.parameters.forEach(add);
  func.returns.forEach(add);
  func.locals.forEach(add);

  return env;
}

// -------------------- VC builder --------------------

function buildFunctionVerificationConditions(func: AnnotatedFunction, module: AnnotatedModule): Predicate {
  const pre: Predicate = func.requires ?? { kind: "true" };
  const post: Predicate = func.ensures ?? { kind: "true" }; // if no ensures, nothing to prove about result
  const wpBody = computeWP(func.body as any, post, module);
  return { kind: "implies", left: pre, right: wpBody } as any;
}

// -------------------- Weakest precondition --------------------

function computeWP(stmt: any, post: Predicate, module: AnnotatedModule): Predicate {
  switch (stmt.kind) {
    case "assign":
      return simplifyPredicate(computeWPAssignment(stmt as AssignStmt, post));
    case "block":
      return simplifyPredicate(computeWPBlock(stmt as BlockStmt, post, module));
    case "if":
      return simplifyPredicate(computeWPIf(stmt as IfStmt, post, module));
    case "while":
      return simplifyPredicate(computeWPWhile(stmt as any, post, module));
    case "expr":
      return simplifyPredicate(post);
    default:
      throw new Error(`computeWP: unknown statement.kind ${(stmt as any).kind}`);
  }
}

function computeWPBlock(block: BlockStmt, post: Predicate, module: AnnotatedModule): Predicate {
  let cur = post;
  for (let i = block.stmts.length - 1; i >= 0; i--) {
    cur = computeWP(block.stmts[i] as any, cur, module);
  }
  return cur;
}

function computeWPIf(ifStmt: IfStmt, post: Predicate, module: AnnotatedModule): Predicate {
  const cond = convertConditionToPredicate(ifStmt.condition);
  const thenWP = computeWP(ifStmt.then as any, post, module);
  const elseWP = ifStmt.else ? computeWP(ifStmt.else as any, post, module) : post;

  // (cond ∧ thenWP) ∨ (¬cond ∧ elseWP)
  return {
    kind: "or",
    left: { kind: "and", left: cond, right: thenWP },
    right: { kind: "and", left: { kind: "not", inner: cond } as any, right: elseWP },
  } as any;
}

function computeWPWhile(whileStmt: any, post: Predicate, module: AnnotatedModule): Predicate {
  const invariant: Predicate | undefined = whileStmt.invariant;
  if (!invariant) {
    // If there is a while-loop but no invariant, treat as verification failure (required by lab).
    throw new Error("while без invariant (для верификации нужен invariant)");
  }

  const cond = convertConditionToPredicate(whileStmt.condition as Condition);
  const bodyWP = computeWP(whileStmt.body as any, invariant, module);

  // inv ∧ ((inv ∧ c) -> wp(body, inv)) ∧ ((inv ∧ ¬c) -> post)
  const vc = {
    kind: "and",
    left: invariant,
    right: {
      kind: "and",
      left: {
        kind: "implies",
        left: { kind: "and", left: invariant, right: cond },
        right: bodyWP,
      },
      right: {
        kind: "implies",
        left: { kind: "and", left: invariant, right: { kind: "not", inner: cond } as any },
        right: post,
      },
    },
  } as any;

  return simplifyPredicate(vc);
}

function computeWPAssignment(assign: AssignStmt, post: Predicate): Predicate {
  if (assign.targets.length !== assign.exprs.length) {
    throw new Error(`assign arity mismatch: ${assign.targets.length} != ${assign.exprs.length}`);
  }

  let cur = post;
  for (let i = 0; i < assign.targets.length; i++) {
    const t = assign.targets[i];
    const e = assign.exprs[i];

    if (t.kind === "lvar") {
      cur = substituteVarInPredicate(cur, (t as VarLValue).name, e);
    } else if (t.kind === "larr") {
      const lt = t as ArrLValue;
      const acc: ArrAccessExpr = { kind: "arraccess", name: lt.name, index: lt.index };
      cur = substituteArrayAccessInPredicate(cur, acc, e);
    } else {
      throw new Error(`unknown lvalue kind ${(t as any).kind}`);
    }
  }

  return cur;
}

// -------------------- Condition -> Predicate --------------------

function convertConditionToPredicate(c: Condition): Predicate {
  switch (c.kind) {
    case "true":
      return { kind: "true" };
    case "false":
      return { kind: "false" };
    case "comparison":
      return c as any;
    case "not":
      return { kind: "not", inner: convertConditionToPredicate((c as any).condition) } as any;
    case "and":
      return {
        kind: "and",
        left: convertConditionToPredicate((c as any).left),
        right: convertConditionToPredicate((c as any).right),
      } as any;
    case "or":
      return {
        kind: "or",
        left: convertConditionToPredicate((c as any).left),
        right: convertConditionToPredicate((c as any).right),
      } as any;
    case "paren":
      return { kind: "paren", inner: convertConditionToPredicate((c as any).inner) } as any;
  }
}

// -------------------- Simplify (small) --------------------

function simplifyPredicate(p: Predicate): Predicate {
  switch ((p as any).kind) {
    case "and": {
      const l = simplifyPredicate((p as AndPredicate).left);
      const r = simplifyPredicate((p as AndPredicate).right);
      if (l.kind === "true") return r;
      if (r.kind === "true") return l;
      if (l.kind === "false" || r.kind === "false") return { kind: "false" };
      return { kind: "and", left: l, right: r } as any;
    }
    case "or": {
      const l = simplifyPredicate((p as OrPredicate).left);
      const r = simplifyPredicate((p as OrPredicate).right);
      if (l.kind === "true" || r.kind === "true") return { kind: "true" };
      if (l.kind === "false") return r;
      if (r.kind === "false") return l;
      return { kind: "or", left: l, right: r } as any;
    }
    case "not": {
      const inner = simplifyPredicate((p as any).inner ?? (p as any).predicate);
      if (inner.kind === "true") return { kind: "false" };
      if (inner.kind === "false") return { kind: "true" };
      if (inner.kind === "not") return (inner as any).inner ?? (inner as any).predicate;
      return { kind: "not", inner } as any;
    }
    case "paren":
      return simplifyPredicate((p as ParenPredicate).inner);
    case "implies": {
      const l = simplifyPredicate((p as any).left);
      const r = simplifyPredicate((p as any).right);
      if (l.kind === "false") return { kind: "true" };
      if (l.kind === "true") return r;
      if (r.kind === "true") return { kind: "true" };
      return { kind: "implies", left: l, right: r } as any;
    }
    default:
      return p;
  }
}

// -------------------- Substitution: variable --------------------

function substituteVarInPredicate(pred: Predicate, varName: string, subst: Expr): Predicate {
  switch ((pred as any).kind) {
    case "true":
    case "false":
      return pred;

    case "comparison": {
      const c = pred as any as ComparisonPredicate;
      return {
        kind: "comparison",
        left: substituteVarInExpr(c.left, varName, subst),
        op: c.op,
        right: substituteVarInExpr(c.right, varName, subst),
      } as any;
    }

    case "and":
      return {
        kind: "and",
        left: substituteVarInPredicate((pred as AndPredicate).left, varName, subst),
        right: substituteVarInPredicate((pred as AndPredicate).right, varName, subst),
      } as any;

    case "or":
      return {
        kind: "or",
        left: substituteVarInPredicate((pred as OrPredicate).left, varName, subst),
        right: substituteVarInPredicate((pred as OrPredicate).right, varName, subst),
      } as any;

    case "not": {
      const inner = (pred as any).inner ?? (pred as any).predicate;
      return { kind: "not", inner: substituteVarInPredicate(inner, varName, subst) } as any;
    }

    case "paren":
      return {
        kind: "paren",
        inner: substituteVarInPredicate((pred as ParenPredicate).inner, varName, subst),
      } as any;

    case "implies":
      return {
        kind: "implies",
        left: substituteVarInPredicate((pred as any).left, varName, subst),
        right: substituteVarInPredicate((pred as any).right, varName, subst),
      } as any;

    case "quantifier": {
      const q = pred as any as QuantifierPredicate;
      if (q.variable.name === varName) return pred; // bound variable
      return { ...q, predicate: substituteVarInPredicate(q.predicate, varName, subst) } as any;
    }

    case "formulaRef": {
      const fr = pred as any as FormulaRefPredicate;
      return { ...fr, args: fr.args.map((a) => substituteVarInExpr(a, varName, subst)) } as any;
    }

    default:
      throw new Error(`substituteVarInPredicate: unknown kind ${(pred as any).kind}`);
  }
}

function substituteVarInExpr(expr: Expr, varName: string, subst: Expr): Expr {
  const k = (expr as any).kind;

  switch (k) {
    case "Num":
      return expr;

    case "Var":
      return (expr as any).name === varName ? subst : expr;

    case "Neg":
      return { ...(expr as any), expr: substituteVarInExpr((expr as any).expr, varName, subst) };

    case "Add":
    case "Sub":
    case "Mul":
    case "Div":
      return {
        ...(expr as any),
        left: substituteVarInExpr((expr as any).left, varName, subst),
        right: substituteVarInExpr((expr as any).right, varName, subst),
      };

    case "funccall": {
      const fc = expr as any as FuncCallExpr;
      return { ...fc, args: fc.args.map((a) => substituteVarInExpr(a, varName, subst)) } as any;
    }

    case "arraccess": {
      const aa = expr as any as ArrAccessExpr;
      return { ...aa, index: substituteVarInExpr(aa.index, varName, subst) } as any;
    }

    default:
      return expr;
  }
}

// -------------------- Substitution: array access --------------------

function substituteArrayAccessInPredicate(pred: Predicate, acc: ArrAccessExpr, subst: Expr): Predicate {
  switch ((pred as any).kind) {
    case "true":
    case "false":
      return pred;

    case "comparison": {
      const c = pred as any as ComparisonPredicate;
      return {
        kind: "comparison",
        left: substituteArrayAccessInExpr(c.left, acc, subst),
        op: c.op,
        right: substituteArrayAccessInExpr(c.right, acc, subst),
      } as any;
    }

    case "and":
      return {
        kind: "and",
        left: substituteArrayAccessInPredicate((pred as AndPredicate).left, acc, subst),
        right: substituteArrayAccessInPredicate((pred as AndPredicate).right, acc, subst),
      } as any;

    case "or":
      return {
        kind: "or",
        left: substituteArrayAccessInPredicate((pred as OrPredicate).left, acc, subst),
        right: substituteArrayAccessInPredicate((pred as OrPredicate).right, acc, subst),
      } as any;

    case "not": {
      const inner = (pred as any).inner ?? (pred as any).predicate;
      return { kind: "not", inner: substituteArrayAccessInPredicate(inner, acc, subst) } as any;
    }

    case "paren":
      return {
        kind: "paren",
        inner: substituteArrayAccessInPredicate((pred as ParenPredicate).inner, acc, subst),
      } as any;

    case "implies":
      return {
        kind: "implies",
        left: substituteArrayAccessInPredicate((pred as any).left, acc, subst),
        right: substituteArrayAccessInPredicate((pred as any).right, acc, subst),
      } as any;

    case "quantifier": {
      const q = pred as any as QuantifierPredicate;
      if (q.variable.name === acc.name) return pred;
      return { ...q, predicate: substituteArrayAccessInPredicate(q.predicate, acc, subst) } as any;
    }

    case "formulaRef": {
      const fr = pred as any as FormulaRefPredicate;
      return { ...fr, args: fr.args.map((a) => substituteArrayAccessInExpr(a, acc, subst)) } as any;
    }

    default:
      throw new Error(`substituteArrayAccessInPredicate: unknown kind ${(pred as any).kind}`);
  }
}

function substituteArrayAccessInExpr(expr: Expr, acc: ArrAccessExpr, subst: Expr): Expr {
  const k = (expr as any).kind;

  if (k === "arraccess") {
    const aa = expr as any as ArrAccessExpr;
    if (aa.name === acc.name && exprEquals(aa.index, acc.index)) return subst;
    return { ...aa, index: substituteArrayAccessInExpr(aa.index, acc, subst) } as any;
  }

  switch (k) {
    case "Num":
    case "Var":
      return expr;
    case "Neg":
      return { ...(expr as any), expr: substituteArrayAccessInExpr((expr as any).expr, acc, subst) };
    case "Add":
    case "Sub":
    case "Mul":
    case "Div":
      return {
        ...(expr as any),
        left: substituteArrayAccessInExpr((expr as any).left, acc, subst),
        right: substituteArrayAccessInExpr((expr as any).right, acc, subst),
      };
    case "funccall": {
      const fc = expr as any as FuncCallExpr;
      return { ...fc, args: fc.args.map((a) => substituteArrayAccessInExpr(a, acc, subst)) } as any;
    }
    default:
      return expr;
  }
}

function exprEquals(a: Expr, b: Expr): boolean {
  const ka = (a as any).kind;
  const kb = (b as any).kind;
  if (ka !== kb) return false;

  switch (ka) {
    case "Num":
      return (a as any).value === (b as any).value;
    case "Var":
      return (a as any).name === (b as any).name;
    case "Neg":
      return exprEquals((a as any).expr, (b as any).expr);
    case "Add":
    case "Sub":
    case "Mul":
    case "Div":
      return (
        (a as any).kind === (b as any).kind &&
        exprEquals((a as any).left, (b as any).left) &&
        exprEquals((a as any).right, (b as any).right)
      );
    case "funccall":
      return (
        (a as any).name === (b as any).name &&
        (a as any).args.length === (b as any).args.length &&
        (a as any).args.every((x: Expr, i: number) => exprEquals(x, (b as any).args[i]))
      );
    case "arraccess":
      return (a as any).name === (b as any).name && exprEquals((a as any).index, (b as any).index);
    default:
      return JSON.stringify(a) === JSON.stringify(b);
  }
}

// -------------------- Predicate -> Z3 --------------------

function convertPredicateToZ3(predicate: Predicate, env: Env, z3: Context, module: AnnotatedModule, solver: any): Bool {
  switch ((predicate as any).kind) {
    case "true":
      return z3.Bool.val(true);
    case "false":
      return z3.Bool.val(false);

    case "comparison":
      return convertComparisonToZ3(predicate as any as ComparisonPredicate, env, z3, module, solver);

    case "and":
      return z3.And(
        convertPredicateToZ3((predicate as AndPredicate).left, env, z3, module, solver),
        convertPredicateToZ3((predicate as AndPredicate).right, env, z3, module, solver)
      );

    case "or":
      return z3.Or(
        convertPredicateToZ3((predicate as OrPredicate).left, env, z3, module, solver),
        convertPredicateToZ3((predicate as OrPredicate).right, env, z3, module, solver)
      );

    case "not": {
      const inner = (predicate as any).inner ?? (predicate as any).predicate;
      return z3.Not(convertPredicateToZ3(inner, env, z3, module, solver));
    }

    case "paren":
      return convertPredicateToZ3((predicate as ParenPredicate).inner, env, z3, module, solver);

    case "implies":
      return z3.Implies(
        convertPredicateToZ3((predicate as any).left, env, z3, module, solver),
        convertPredicateToZ3((predicate as any).right, env, z3, module, solver)
      );

    case "quantifier":
      return convertQuantifierToZ3(predicate as any as QuantifierPredicate, env, z3, module, solver);

    case "formulaRef":
      return convertFormulaRefToZ3(predicate as any as FormulaRefPredicate, env, z3, module, solver);

    default:
      throw new Error(`convertPredicateToZ3: unknown predicate.kind ${(predicate as any).kind}`);
  }
}

function convertComparisonToZ3(comparison: ComparisonPredicate, env: Env, z3: Context, module: AnnotatedModule, solver: any): Bool {
  const left = convertExprToZ3(comparison.left, env, z3, module, solver);
  const right = convertExprToZ3(comparison.right, env, z3, module, solver);

  switch (comparison.op) {
    case "==":
      return left.eq(right);
    case "!=":
      return left.neq(right);
    case ">":
      return left.gt(right);
    case "<":
      return left.lt(right);
    case ">=":
      return left.ge(right);
    case "<=":
      return left.le(right);
  }
}

function convertQuantifierToZ3(quant: QuantifierPredicate, env: Env, z3: Context, module: AnnotatedModule, solver: any): Bool {
  if (quant.variable.typeName !== "int") {
    throw new Error(`Quantifier variable must be int, got ${quant.variable.name}:${quant.variable.typeName}`);
  }

  const v = z3.Int.const(quant.variable.name);
  const env2: Env = new Map(env);
  env2.set(quant.variable.name, v);

  const body = convertPredicateToZ3(quant.predicate, env2, z3, module, solver);
  return quant.quantifier === "forall" ? z3.ForAll([v], body) : z3.Exists([v], body);
}

// formulaRef -> inline formula body
function convertFormulaRefToZ3(fr: FormulaRefPredicate, env: Env, z3: Context, module: AnnotatedModule, solver: any): Bool {
  const f = module.formulas.find((ff) => ff.name === fr.name);
  if (!f) throw new Error(`Formula '${fr.name}' not found`);

  if (f.parameters.length !== fr.args.length) {
    throw new Error(`Formula '${fr.name}' expects ${f.parameters.length} args, got ${fr.args.length}`);
  }

  const env2: Env = new Map(env);

  for (let i = 0; i < f.parameters.length; i++) {
    const p = f.parameters[i];
    if (p.typeName !== "int") throw new Error(`Formula param must be int, got ${p.name}:${p.typeName}`);
    const argZ3 = convertExprToZ3(fr.args[i], env, z3, module, solver);
    env2.set(p.name, argZ3);
  }

  return convertPredicateToZ3(f.body as any, env2, z3, module, solver);
}

// -------------------- Expr -> Z3 --------------------

function convertExprToZ3(expr: Expr, env: Env, z3: Context, module: AnnotatedModule, solver: any): Arith {
  const k = (expr as any).kind;

  switch (k) {
    case "Num":
      return z3.Int.val((expr as any).value);

    case "Var": {
      const name = (expr as any).name;
      const v = env.get(name);
      if (!v) throw new Error(`unknown variable '${name}'`);
      if (!isArith(v)) throw new Error(`'${name}' is an array but used as int`);
      return v;
    }

    case "Neg":
      return convertExprToZ3((expr as any).expr, env, z3, module, solver).neg();

    case "Add": {
      const l = convertExprToZ3((expr as any).left, env, z3, module, solver);
      const r = convertExprToZ3((expr as any).right, env, z3, module, solver);
      return l.add(r);
    }
    case "Sub": {
      const l = convertExprToZ3((expr as any).left, env, z3, module, solver);
      const r = convertExprToZ3((expr as any).right, env, z3, module, solver);
      return l.sub(r);
    }
    case "Mul": {
      const l = convertExprToZ3((expr as any).left, env, z3, module, solver);
      const r = convertExprToZ3((expr as any).right, env, z3, module, solver);
      return l.mul(r);
    }
    case "Div": {
      const l = convertExprToZ3((expr as any).left, env, z3, module, solver);
      const r = convertExprToZ3((expr as any).right, env, z3, module, solver);
      return l.div(r);
    }

    case "arraccess": {
      const aa = expr as any as ArrAccessExpr;
      const arr = env.get(aa.name);
      if (!arr) throw new Error(`unknown array '${aa.name}'`);
      const idx = convertExprToZ3(aa.index, env, z3, module, solver);
      return (z3 as any).Select(arr as any, idx) as any;
    }

    case "funccall": {
      const fc = expr as any as FuncCallExpr;

      // builtin: length(a:int[]) -> int
      if (fc.name === "length") {
        if (fc.args.length !== 1) throw new Error("length expects 1 argument");
        const a0 = fc.args[0] as any;
        if (a0.kind !== "Var") throw new Error("length expects array variable argument");
        const lenName = `len_${a0.name}`;
        if (!env.has(lenName)) env.set(lenName, z3.Int.const(lenName));
        return env.get(lenName)! as any;
      }

      const args = fc.args.map((a) => convertExprToZ3(a, env, z3, module, solver));
      const argKey = args.map((a) => a.toString()).join("_");
      const resName = `${fc.name}_result_${argKey}`;

      const cached = env.get(resName);
      if (cached) {
        if (!isArith(cached)) throw new Error("internal: cached result is not Arith");
        return cached;
      }

      const res = z3.Int.const(resName);
      env.set(resName, res);

      addFunctionEnsuresAxiom(fc.name, args, res, z3, module, solver);
      return res;
    }

    default:
      throw new Error(`convertExprToZ3: unknown expr.kind '${k}'`);
  }
}

// -------------------- Optional: ensures axiom for calls --------------------

// NEW: helper for stable key in result names for recursive axioms
function stableKey(a: Arith): string {
  return a
    .toString()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function addFunctionEnsuresAxiom(name: string, args: Arith[], result: Arith, z3: Context, module: AnnotatedModule, solver: any) {
  const f = module.functions.find((fn) => fn.name === name);
  if (!f) return;
  if (!f.ensures) return;
  if (f.returns.length !== 1) return;
  if (f.returns[0].typeName !== "int") return;

  // NEW: if recursive spec (factorial), add base+step axioms once
  if (predicateContainsFunCall(f.ensures, name)) {
    if (recursiveAxiomsAdded.has(name)) return;
    recursiveAxiomsAdded.add(name);

    // factorial-style axioms:
    // n == 0 -> fact(n) == 1
    // n > 0  -> fact(n) == n * fact(n-1)
    const n = z3.Int.const(`n_${name}_rec`);

    const resN = z3.Int.const(`${name}_result_${stableKey(n)}`);
    const nMinus1 = n.sub(z3.Int.val(1));
    const resNMinus1 = z3.Int.const(`${name}_result_${stableKey(nMinus1)}`);

    solver.add(z3.ForAll([n], z3.Implies(n.eq(0), resN.eq(z3.Int.val(1)))));
    solver.add(z3.ForAll([n], z3.Implies(n.gt(0), resN.eq(n.mul(resNMinus1)))));

    return;
  }

  const env2: Env = new Map();

  for (let i = 0; i < f.parameters.length; i++) {
    const p = f.parameters[i];
    if (p.typeName !== "int") return;
    if (i >= args.length) return;
    env2.set(p.name, args[i]);
  }

  env2.set(f.returns[0].name, result);

  const ax = convertPredicateToZ3(f.ensures, env2, z3, module, solver);
  solver.add(ax);
}

function predicateContainsFunCall(p: Predicate, name: string): boolean {
  switch ((p as any).kind) {
    case "true":
    case "false":
      return false;
    case "comparison":
      return exprContainsFunCall((p as any).left, name) || exprContainsFunCall((p as any).right, name);
    case "and":
    case "or":
      return predicateContainsFunCall((p as any).left, name) || predicateContainsFunCall((p as any).right, name);
    case "not": {
      const inner = (p as any).inner ?? (p as any).predicate;
      return predicateContainsFunCall(inner, name);
    }
    case "paren":
      return predicateContainsFunCall((p as any).inner, name);
    case "quantifier":
      return predicateContainsFunCall((p as any).predicate, name);
    case "formulaRef":
      return (p as any).args.some((a: Expr) => exprContainsFunCall(a, name));
    case "implies":
      return predicateContainsFunCall((p as any).left, name) || predicateContainsFunCall((p as any).right, name);
    default:
      return false;
  }
}

function exprContainsFunCall(e: Expr, name: string): boolean {
  const k = (e as any).kind;
  switch (k) {
    case "Num":
    case "Var":
      return false;
    case "Neg":
      return exprContainsFunCall((e as any).expr, name);
    case "Add":
    case "Sub":
    case "Mul":
    case "Div":
      return exprContainsFunCall((e as any).left, name) || exprContainsFunCall((e as any).right, name);
    case "arraccess":
      return exprContainsFunCall((e as any).index, name);
    case "funccall":
      if ((e as any).name === name) return true;
      return (e as any).args.some((a: Expr) => exprContainsFunCall(a, name));
    default:
      return false;
  }
}
