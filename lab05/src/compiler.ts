import { c as C, Op, I32 } from "../../wasm";
import { Expr } from "../../lab04";
import { buildOneFunctionModule, Fn } from "./emitHelper";
const { i32, get_local} = C;
    
export function getVariables(e: Expr): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const visit = (node: Expr): void => {
    switch (node.kind) {
      case "Num":
        return;
      case "Var":
        if (!seen.has(node.name)) {
          seen.add(node.name);
          out.push(node.name);
        }
        return;
      case "Neg":
        visit(node.expr);
        return;
      case "Add":
      case "Sub":
      case "Mul":
      case "Div":
        visit(node.left);
        visit(node.right);
        return;
    }
  };

  visit(e);
  return out;
}

export async function buildFunction(e: Expr, variables: string[]): Promise<Fn<number>>
{
    let expr = wasm(e, variables)
    return await buildOneFunctionModule("test", variables.length, [expr]);
}

function wasm(e: Expr, args: string[]): Op<I32> {
  switch (e.kind) {
    case "Num":
      return i32.const(e.value | 0);

    case "Var": {
      const idx = args.indexOf(e.name);
      if (idx < 0) {
        throw new WebAssembly.RuntimeError(
          `Unknown variable '${e.name}' is not in parameter list [${args.join(", ")}].`
        );
      }
      return get_local(i32,idx); 
    }

    case "Neg": {
      const x = wasm(e.expr, args);
      return i32.sub(i32.const(0), x);
    }

    case "Add": {
      const l = wasm(e.left, args);
      const r = wasm(e.right, args);
      return i32.add(l, r);
    }

    case "Sub": {
      const l = wasm(e.left, args);
      const r = wasm(e.right, args);
      return i32.sub(l, r);
    }

    case "Mul": {
      const l = wasm(e.left, args);
      const r = wasm(e.right, args);
      return i32.mul(l, r);
    }

    case "Div": {
      const l = wasm(e.left, args);
      const r = wasm(e.right, args);
      return i32.div_s(l, r);
    }
  }
}
