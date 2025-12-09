import {
  Module,
  FunctionDef,
  WhileStmt,
  ParameterDef,
  Expr,
} from '../../lab08';


export type Predicate =
  | TruePredicate
  | FalsePredicate
  | ComparisonPredicate
  | NotPredicate
  | AndPredicate
  | OrPredicate
  | ParenPredicate
  | QuantifierPredicate
  | FormulaRefPredicate;

export interface TruePredicate {
  kind: "true";
}

export interface FalsePredicate {
  kind: "false";
}

export interface ComparisonPredicate {
  kind: "comparison";
  left: Expr;
  op: "==" | "!=" | ">" | "<" | ">=" | "<=";
  right: Expr;
}

export interface NotPredicate {
  kind: "not";
  inner: Predicate;
}

export interface AndPredicate {
  kind: "and";
  left: Predicate;
  right: Predicate;
}

export interface OrPredicate {
  kind: "or";
  left: Predicate;
  right: Predicate;
}

export interface ParenPredicate {
  kind: "paren";
  inner: Predicate;
}

export type QuantifierKind = "forall" | "exists";

export interface QuantifierPredicate {
  kind: "quantifier";
  quantifier: QuantifierKind;
  variable: ParameterDef;  
  predicate: Predicate;
}

export interface FormulaRefPredicate {
  kind: "formulaRef";
  name: string;
  args: Expr[];
}


export interface FormulaDef {
  type: "formula";
  name: string;
  parameters: ParameterDef[];
  body: Predicate;
}


export interface AnnotatedWhileStmt extends WhileStmt {
  invariant?: Predicate;
}

export interface AnnotatedFunction extends FunctionDef {
  requires?: Predicate;
  ensures?: Predicate;
}

export interface AnnotatedModule extends Module {
  functions: AnnotatedFunction[];
  formulas: FormulaDef[];
}
