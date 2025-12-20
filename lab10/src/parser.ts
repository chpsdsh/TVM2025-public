// lab10/src/parser.ts

import { MatchResult, Semantics } from "ohm-js";

import grammar, { FunnierActionDict } from "./funnier.ohm-bundle";

import {
  AnnotatedModule,
  AnnotatedFunction,
  AnnotatedWhileStmt,
  FormulaDef,
  Predicate,
  TruePredicate,
  FalsePredicate,
  ComparisonPredicate,
  NotPredicate,
  AndPredicate,
  OrPredicate,
  ParenPredicate,
  QuantifierPredicate,
  FormulaRefPredicate,
} from "./funnier";

import {
  ParameterDef,
  Expr,
  Statement,
  Condition,
  ErrorCode,
  FunnyError,
  Location,
  getFunnyAst,
} from "../../lab08";

// -------------------- helpers --------------------

function collectList<T>(node: any): T[] {
  return node.asIteration().children.map((c: any) => c.parse() as T);
}

function foldLogicalChain<T>(
  first: any,
  rest: any,
  makeNode: (left: T, right: T) => T
): T {
  let node = first.parse() as T;
  const restChildren = rest.children ?? rest.asIteration?.().children ?? [];
  for (const r of restChildren) {
    const rhs = r.parse() as T;
    node = makeNode(node, rhs);
  }
  return node;
}

function repeatPrefix<T>(
  nots: any,
  base: any,
  makeNode: (inner: T) => T
): T {
  let node = base.parse() as T;
  const count =
    nots.children?.length ?? nots.asIteration?.().children.length ?? 0;
  for (let i = 0; i < count; i++) {
    node = makeNode(node);
  }
  return node;
}

// -------------------- Location plumbing --------------------

let currentFile: string | undefined = undefined;

function mkLoc(nodeOrThis: any): Location | undefined {
  const interval = nodeOrThis?.source;
  if (!interval) return undefined;

  const start = interval.getLineAndColumn();
  const end = interval.getLineAndColumn(interval.endIdx);

  return {
    file: currentFile,
    startLine: start.lineNum,
    startCol: start.colNum,
    endLine: end.lineNum,
    endCol: end.colNum,
  };
}

function withLoc<T extends object>(nodeOrThis: any, obj: T): T {
  const loc = mkLoc(nodeOrThis);
  return loc ? ({ ...(obj as any), loc } as T) : obj;
}

// -------------------- Semantics actions --------------------

const getFunnierAst = {
  ...(getFunnyAst as any),

  // -------- module / items --------

  Module(items: any) {
    const functions: AnnotatedFunction[] = [];
    const formulas: FormulaDef[] = [];

    for (const it of items.children) {
      const node = it.parse() as AnnotatedFunction | FormulaDef;
      if (node.kind === "fun") {
        functions.push(node as AnnotatedFunction);
      } else if (node.kind === "formula") {
        formulas.push(node as FormulaDef);
      }
    }

    return withLoc(this, {
      kind: "module",
      functions,
      formulas,
    } as AnnotatedModule);
  },

  Item_fun(fn: any) {
    return fn.parse() as AnnotatedFunction;
  },

  Item_formula(form: any) {
    return form.parse() as FormulaDef;
  },

  // -------- returns --------

  RetOrVoid_retSpec(rs: any) {
    return rs.parse() as ParameterDef[];
  },

  RetOrVoid_void(_returnsTok: any, _voidTok: any) {
    return [] as ParameterDef[];
  },

  // -------- function --------

  Function(
    name: any,
    _lp: any,
    paramsNode: any,
    _rp: any,
    requiresOpt: any,
    retOrVoid: any,
    ensuresOpt: any,
    usesOpt: any,
    stmt: any
  ) {
    const nameStr = name.sourceString;
    const parameters = paramsNode.parse() as ParameterDef[];
    const returns = retOrVoid.parse() as ParameterDef[];
    const locals =
      usesOpt.children.length > 0
        ? (usesOpt.child(0).parse() as ParameterDef[])
        : [];

    const requires =
      requiresOpt.children.length > 0
        ? (requiresOpt.child(0).parse() as Predicate)
        : undefined;

    const ensures =
      ensuresOpt.children.length > 0
        ? (ensuresOpt.child(0).parse() as Predicate)
        : undefined;

    const body = stmt.parse() as Statement;

    return withLoc(this, {
      kind: "fun",
      name: nameStr,
      parameters,
      returns,
      locals,
      body,
      requires,
      ensures,
    } as AnnotatedFunction);
  },

  RequiresSpec(_requires: any, pred: any) {
    return pred.parse() as Predicate;
  },

  EnsuresSpec(_ensures: any, pred: any) {
    return pred.parse() as Predicate;
  },

  // -------- while + invariant --------

  While(_while: any, _lp: any, cond: any, _rp: any, invOpt: any, body: any) {
    const condition = cond.parse() as Condition;

    const invariant =
      invOpt.children.length > 0
        ? (invOpt.child(0).parse() as Predicate)
        : undefined;

    const bodyStmt = body.parse() as Statement;

    return withLoc(this, {
      kind: "while",
      condition,
      body: bodyStmt,
      invariant,
    } as AnnotatedWhileStmt);
  },

  InvariantSpec(_inv: any, pred: any) {
    return pred.parse() as Predicate;
  },

  // -------- formulas --------

  Formula(
    name: any,
    _lp: any,
    paramsNode: any,
    _rp: any,
    _arrow: any,
    bodyPred: any,
    _semi: any
  ) {
    const nameStr = name.sourceString;
    const params = paramsNode.parse() as ParameterDef[];
    const body = bodyPred.parse() as Predicate;

    return withLoc(this, {
      kind: "formula",
      name: nameStr,
      parameters: params,
      body,
    } as FormulaDef);
  },

  // -------- predicates --------

  Predicate(orNode: any) {
    return orNode.parse() as Predicate;
  },

  OrPred(first: any, _ops: any, rest: any) {
    const node = foldLogicalChain<Predicate>(first, rest, (left, right) => {
      return {
        kind: "or",
        left,
        right,
      } as OrPredicate;
    });

    return withLoc(this, node as any);
  },

  AndPred(first: any, _ops: any, rest: any) {
    const node = foldLogicalChain<Predicate>(first, rest, (left, right) => {
      return {
        kind: "and",
        left,
        right,
      } as AndPredicate;
    });

    return withLoc(this, node as any);
  },

  NotPred(nots: any, atom: any) {
    const node = repeatPrefix<Predicate>(nots, atom, (inner) => {
      return {
        kind: "not",
        inner,
      } as NotPredicate;
    });

    return withLoc(this, node as any);
  },

  AtomPred_true(_t: any) {
    return withLoc(this, { kind: "true" } as TruePredicate);
  },

  AtomPred_false(_f: any) {
    return withLoc(this, { kind: "false" } as FalsePredicate);
  },

  AtomPred_cmp(comp: any) {
    const c = comp.parse() as any;
    return withLoc(this, {
      kind: "comparison",
      left: c.left as Expr,
      op: c.op as any,
      right: c.right as Expr,
    } as ComparisonPredicate);
  },

  AtomPred_quant(q: any) {
    // Quantifier(...) below already withLoc(this,...)
    return q.parse() as QuantifierPredicate;
  },

  AtomPred_formulaRef(fr: any) {
    // FormulaRef(...) below already withLoc(this,...)
    return fr.parse() as FormulaRefPredicate;
  },

  AtomPred_paren(p: any) {
    // ParenPred(...) below already withLoc(this,...)
    return p.parse() as ParenPredicate;
  },

  ParenPred(_lp: any, inner: any, _rp: any) {
    return withLoc(this, {
      kind: "paren",
      inner: inner.parse() as Predicate,
    } as ParenPredicate);
  },

  Quantifier(qTok: any, _lp: any, paramNode: any, _bar: any, pred: any, _rp: any) {
    const quantifier = qTok.sourceString as "forall" | "exists";
    const variable = paramNode.parse() as ParameterDef;
    const body = pred.parse() as Predicate;

    return withLoc(this, {
      kind: "quantifier",
      quantifier,
      variable,
      predicate: body,
    } as QuantifierPredicate);
  },

  FormulaRef(name: any, _lp: any, argsNode: any, _rp: any) {
    return withLoc(this, {
      kind: "formulaRef",
      name: name.sourceString,
      args: argsNode.parse() as Expr[],
    } as FormulaRefPredicate);
  },

  ParamList(list: any) {
    return collectList<ParameterDef>(list);
  },
} satisfies FunnierActionDict<any>;

// -------------------- semantics wiring --------------------

export const semantics: FunnySemanticsExt =
  grammar.Funnier.createSemantics() as FunnySemanticsExt;

semantics.addOperation("parse()", getFunnierAst);

export interface FunnySemanticsExt extends Semantics {
  (match: MatchResult): FunnyActionsExt;
}

interface FunnyActionsExt {
  parse(): AnnotatedModule;
}

// -------------------- public API --------------------

export function parseFunnier(source: string, origin?: string): AnnotatedModule {
  currentFile = origin;

  const match: MatchResult = grammar.Funnier.match(source, "Module");

  if (match.failed()) {
    const m: any = match;
    const pos =
      typeof m.getRightmostFailurePosition === "function"
        ? m.getRightmostFailurePosition()
        : null;

    const message: string = m.message ?? "Syntax error in Funnier module.";

    throw new FunnyError(message, ErrorCode.ParseError, pos?.lineNum, pos?.colNum);
  }

  const mod = (semantics as FunnySemanticsExt)(match).parse();
  return mod;
}
