import {
  Module,
  FunctionDef,
  WhileStmt,
  ParameterDef,
  Expr,
  Location,
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
  loc?: Location;
}

export interface FalsePredicate {
  kind: "false";
  loc?: Location;
}

export interface ComparisonPredicate {
  kind: "comparison";
  left: Expr;
  op: "==" | "!=" | ">" | "<" | ">=" | "<=";
  right: Expr;
  loc?: Location;
}

export interface NotPredicate {
  kind: "not";
  inner: Predicate;
  loc?: Location;
}

export interface AndPredicate {
  kind: "and";
  left: Predicate;
  right: Predicate;
  loc?: Location;
}

export interface OrPredicate {
  kind: "or";
  left: Predicate;
  right: Predicate;
  loc?: Location;
}

export interface ParenPredicate {
  kind: "paren";
  inner: Predicate;
  loc?: Location;
}

export type QuantifierKind = "forall" | "exists";

export interface QuantifierPredicate {
  kind: "quantifier";
  quantifier: QuantifierKind;
  variable: ParameterDef;
  predicate: Predicate;
  loc?: Location;
}

export interface FormulaRefPredicate {
  kind: "formulaRef";
  name: string;
  args: Expr[];
  loc?: Location;
}


export interface FormulaDef {
  kind: "formula";
  name: string;
  parameters: ParameterDef[];
  body: Predicate;
  loc?: Location;
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
