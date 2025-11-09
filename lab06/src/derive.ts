import { Expr } from "../../lab04";

export function derive(e: Expr, varName: string): Expr {
  return simplify(d(e, varName));
}

function d(e: Expr, v: string): Expr {
  switch (e.kind) {
    case "Num":
      return num(0);

    case "Var":
      return num(e.name === v ? 1 : 0);

    case "Neg":
      return neg(d(e.expr, v));

    case "Add":
      return add(d(e.left, v), d(e.right, v));

    case "Sub":
      return sub(d(e.left, v), d(e.right, v));

    case "Mul": {
      const f = e.left, g = e.right;
      return add(mul(d(f, v), g), mul(f, d(g, v)));
    }

    case "Div": {
      const f = e.left, g = e.right;
      const nume = sub(mul(d(f, v), g), mul(f, d(g, v)));
      const deno = mul(g, g);
      return div(nume, deno);
    }
  }
}

function simplify(e: Expr): Expr {
  switch (e.kind) {
    case "Num":
    case "Var":
      return e;

    case "Neg": {
      const a = simplify(e.expr);

      if (a.kind === "Neg") return a.expr;

      if (a.kind === "Num") return num(-a.value);

      if (a.kind === "Div" && a.left.kind === "Num" && a.left.value === -1) {
        return div(num(1), a.right);
      }

      return neg(a);
    }

    case "Add": {
      const L = simplify(e.left);
      const R = simplify(e.right);

      if (isZero(L)) return R;
      if (isZero(R)) return L;

      if (L.kind === "Num" && R.kind === "Num") return num(L.value + R.value);

      return add(L, R);
    }

    case "Sub": {
      const L = simplify(e.left);
      const R = simplify(e.right);

      if (isZero(R)) return L;

      if (isZero(L)) return simplify(neg(R));

      if (L.kind === "Num" && R.kind === "Num") return num(L.value - R.value);

      return sub(L, R);
    }

    case "Mul": {
      const L = simplify(e.left);
      const R = simplify(e.right);

      if (isZero(L) || isZero(R)) return num(0);

      if (isOne(L)) return R;
      if (isOne(R)) return L;

      if (L.kind === "Num" && L.value === -1) return simplify(neg(R));
      if (R.kind === "Num" && R.value === -1) return simplify(neg(L));

      if (L.kind === "Num" && R.kind === "Num") return num(L.value * R.value);

      return mul(L, R);
    }

    case "Div": {
      const L = simplify(e.left);
      const R = simplify(e.right);

      if (isZero(L)) return num(0);

      if (isOne(R)) return L;

      if (L.kind === "Num" && R.kind === "Num") return num(L.value / R.value);

      return div(L, R);
    }
  }
}

function num(n: number): Expr {   return { kind: "Num", value: n === 0 ? 0 : n }; }
function neg(a: Expr): Expr { return { kind: "Neg", expr: a }; }
function add(a: Expr, b: Expr): Expr { return { kind: "Add", left: a, right: b }; }
function sub(a: Expr, b: Expr): Expr { return { kind: "Sub", left: a, right: b }; }
function mul(a: Expr, b: Expr): Expr { return { kind: "Mul", left: a, right: b }; }
function div(a: Expr, b: Expr): Expr { return { kind: "Div", left: a, right: b }; }

function isZero(e: Expr): boolean { return e.kind === "Num" && e.value === 0; }
function isOne(e: Expr): boolean  { return e.kind === "Num" && e.value === 1; }
