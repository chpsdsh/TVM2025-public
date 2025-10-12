import { Expr } from "./ast";

function prec(kind: Expr["kind"]): number {
  switch (kind) {
    case "Num":
    case "Var": return 4;   
    case "Neg": return 3;   
    case "Mul":
    case "Div": return 2;
    case "Add":
    case "Sub": return 1;
  }
}

function needParensSelf(node: Expr, parentKind: Expr["kind"] | null, isRight: boolean): boolean {
  if (parentKind === null) return false; 

  const cp = prec(node.kind);
  const pp = prec(parentKind);

  if (cp < pp) return true;

  if (cp === pp && isRight && (parentKind === "Sub" || parentKind === "Div")) {
    return true;
  }
  return false;
}

function printRec(e: Expr, parentKind: Expr["kind"] | null, isRight: boolean): string {
  switch (e.kind) {
    case "Num":
      return String(e.value);

    case "Var":
      return e.name;

    case "Neg": {
      const inner = printRec(e.expr, "Neg", true);
      const s = `-${inner}`;
      return needParensSelf(e, parentKind, isRight) ? `(${s})` : s;
    }

    case "Add":
    case "Sub":
    case "Mul":
    case "Div": {
      const opStr =
        e.kind === "Add" ? "+" :
        e.kind === "Sub" ? "-" :
        e.kind === "Mul" ? "*" : 
        "/";

      const L = printRec(e.left,  e.kind, false);
      const R = printRec(e.right, e.kind, true);

      const s = `${L} ${opStr} ${R}`;
      return needParensSelf(e, parentKind, isRight) ? `(${s})` : s;
    }
  }
}

export function printExpr(e: Expr): string {
  return printRec(e, null, false);
}
