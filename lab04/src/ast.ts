export type Num = { kind: "Num"; value: number };
export type Var = { kind: "Var"; name: string };
export type Neg = { kind: "Neg"; expr: Expr };
export type Bin =
  | { kind: "Add"; left: Expr; right: Expr }
  | { kind: "Sub"; left: Expr; right: Expr }
  | { kind: "Mul"; left: Expr; right: Expr }
  | { kind: "Div"; left: Expr; right: Expr };

export type Expr = Num | Var | Neg | Bin;