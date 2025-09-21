import { ReversePolishNotationActionDict } from "./rpn.ohm-bundle";

export const rpnStackDepth = {
    Exp_add(left: any, right: any, arg2: any) {
        const L = left.stackDepth;
        const R = right.stackDepth;
        return {
            max: Math.max(L.max, L.out + R.max),
            out: L.out + R.out - 1, 
        };
    },

    Exp_mul(left: any, right: any, arg2: any) {
        const L = left.stackDepth;
        const R = right.stackDepth;
        return {
            max: Math.max(L.max, L.out + R.max),
            out: L.out + R.out - 1, 
        };
    },
    Exp_lit(arg0: any) {
        return { max: 1, out: 1 }
    },
    Exp(arg0: any) {
        return arg0.stackDepth
    },
    number(arg0: any) {
        return { max: 1, out: 1 }
    }
} satisfies ReversePolishNotationActionDict<StackDepth>;
export type StackDepth = { max: number, out: number };
