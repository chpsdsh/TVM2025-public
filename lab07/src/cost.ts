import { Expr } from "../../lab04";

export function cost(e: Expr): number {
  switch (e.kind) {
    case "Num": return 0;
    case "Var": return 1;
    case "Neg": return 1 + cost(e.expr);
    case "Add":
    case "Sub":
    case "Mul":
    case "Div":
      return 1 + cost(e.left) + cost(e.right);
  }
}
