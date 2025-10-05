import { MatchResult, IterationNode, NonterminalNode, TerminalNode } from "ohm-js";
import grammar, { ArithmeticActionDict, ArithmeticSemantics } from "./arith.ohm-bundle";

export const arithSemantics: ArithSemantics = grammar.createSemantics() as ArithSemantics;

function fold(
    this: any,
    first: any,
    ops: any,
    rhss: any,
    step: (acc: number, op: string, rhs: number) => number
): number {
    const params: any = this.args.params;
    let acc = (first as any).calculate(params);

    const nOps = (ops as any).children.length;
    const nRhss = (rhss as any).children.length;
    const n = Math.min(nOps, nRhss);

    for (let i = 0; i < n; i++) {
        const op = (ops as any).child(i).sourceString as string;
        const rhs = (rhss as any).child(i).calculate(params) as number;
        acc = step(acc, op, rhs);
    }
    return acc;
}

const arithCalc = {
    Expr(this: any, _leadSpaces: any, add: any, _trailSpaces: any, _end: any) {
        return (add as any).calculate(this.args.params);
    },

    AddExp(this: any, first: any, ops: any, rhss: any) {
        return fold.call(this, first, ops, rhss, (acc, op, rhs) =>
            op === "+" ? acc + rhs : acc - rhs
        );
    },

    MulExp(this: any, first: any, ops: any, rhss: any) {
        return fold.call(this, first, ops, rhss, (acc, op, rhs) => {
            if (op === "*") return acc * rhs;
            if (rhs === 0) throw new Error("Division by zero")
            return acc / rhs;
        });
    },

    Unary_neg(this: any, _minus: any, u: any) {
        return -(u .calculate(this.args.params) as number)
    },

    Unary_prim(this: any, p: any) {
        return p.calculate(this.args.params)
    },

    Unary(this: any, n: any) {
        return n.calculate(this.args.params)
    },

    PriExp_paren(this: any, _lp: any, e: any, _rp: any) {
        return e.calculate(this.args.params)
    },

    PriExp(this: any, n: any) {
        return n.calculate(this.args.params)
    },

    AddOp(this: any, _tok: any) {
        return this.sourceString.charCodeAt(0)
    },

    MulOp(this: any, _tok: any) {
        return this.sourceString.charCodeAt(0)
    },

    variable(this: any, _head: any, _tail: any) {
        const name = (this as any).sourceString as string;
        const params: any = this.args.params;
        return Object.prototype.hasOwnProperty.call(params, name) ? params[name] : Number.NaN;
    },

    number(this: any, _digits: any) {
        return Number(this.sourceString);
    },
}

arithSemantics.addOperation<number>("calculate(params)", arithCalc as any);

export interface ArithActions {
    calculate(params: any): number;
}

export interface ArithSemantics extends ArithmeticSemantics {
    (match: MatchResult): ArithActions;
}
