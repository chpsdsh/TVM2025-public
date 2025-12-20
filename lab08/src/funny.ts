import * as arith from "../../lab04";

export const enum ErrorCode {
    ParseError = 'E_PARSE_ERROR',
    DuplicateFunction = 'E_DUPLICATE_FUNCTION',
    Redeclaration = 'E_REDECLARATION',
    AssignArity = 'E_ASSIGN_ARITY',
    AssignUndeclaredVar = 'E_ASSIGN_UNDECLARED_VAR',
    AssignUndeclaredArray = 'E_ASSIGN_UNDECLARED_ARRAY',
    UseUndeclaredVar = 'E_USE_UNDECLARED_VAR',
    OperatorMultiValue = 'E_OPERATOR_MULTI_VALUE',
    UnknownFunction = 'E_UNKNOWN_FUNCTION',
    ArgumentCount = 'E_ARGUMENT_COUNT',
    ArgumentMultiValue = 'E_ARGUMENT_MULTI_VALUE',
    AccessUndeclaredArray = 'E_ACCESS_UNDECLARED_ARRAY',
    ArrayIndexMultiValue = 'E_ARRAY_INDEX_MULTI_VALUE',
    ComparisonMultiValue = 'E_COMPARISON_MULTI_VALUE',
    TypeMismatch = 'E_TYPE_MISMATCH',
    VerificationFailed = 'E_VERIFICATION_FAILED',

}

export class FunnyError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly startLine?: number,
        public readonly startCol?: number,
        public readonly endCol?: number,
        public readonly endLine?: number
    ) {
        super(message);
    }
}

export interface Module {
    kind: "module";
    functions: FunctionDef[];
}

export interface FunctionDef {
    kind: "fun";
    name: string;
    parameters: ParameterDef[];
    returns: ParameterDef[];
    locals: ParameterDef[];
    body: Statement;
    loc?: Location;
}

export interface ParameterDef {
    kind: "param";
    name: string;
    typeName: "int" | "int[]";
    loc?: Location;
}

export type Statement =
    | AssignStmt
    | BlockStmt
    | IfStmt
    | WhileStmt
    | ExprStmt;

export type LValue = VarLValue | ArrLValue;

export interface VarLValue {
    kind: "lvar";
    name: string;
    loc?: Location;
}

export interface ArrLValue {
    kind: "larr";
    name: string;
    index: Expr;
    loc?: Location;
}


export interface AssignStmt {
    kind: "assign";
    targets: LValue[];
    exprs: Expr[];
    loc?: Location;
}

export interface BlockStmt {
    kind: "block";
    stmts: Statement[];
    loc?: Location;
}

export interface IfStmt {
    kind: "if";
    condition: Condition;
    then: Statement;
    else: Statement | null;
    loc?: Location;
}

export interface WhileStmt {
    kind: "while";
    condition: Condition;
    body: Statement;
    loc?: Location;
}

export interface ExprStmt {
    kind: "expr";
    expr: Expr;
    loc?: Location;
}


export type Expr =
    | arith.Expr
    | FuncCallExpr
    | ArrAccessExpr;

export interface FuncCallExpr {
  kind: "funccall";
  name: string;
  args: Expr[];
  loc?: Location;
}

export interface ArrAccessExpr {
  kind: "arraccess";
  name: string;
  index: Expr;
  loc?: Location;
}


export type Condition =
    | TrueCond
    | FalseCond
    | ComparisonCond
    | NotCond
    | AndCond
    | OrCond
    | ParenCond;

export interface TrueCond {
  kind: "true";
  loc?: Location;
}

export interface FalseCond {
  kind: "false";
  loc?: Location;
}

export interface ComparisonCond {
  kind: "comparison";
  left: Expr;
  op: "==" | "!=" | ">" | "<" | ">=" | "<=";
  right: Expr;
  loc?: Location;
}

export interface NotCond {
  kind: "not";
  condition: Condition;
  loc?: Location;
}

export interface AndCond {
  kind: "and";
  left: Condition;
  right: Condition;
  loc?: Location;
}

export interface OrCond {
  kind: "or";
  left: Condition;
  right: Condition;
  loc?: Location;
}

export interface ParenCond {
  kind: "paren";
  inner: Condition;
  loc?: Location;
}


export interface Location {
    file?: string;
    startLine: number;
    startCol: number;
    endLine?: number;
    endCol?: number;
}