import { Dict, MatchResult, Semantics } from "ohm-js";
import grammar, { AddMulActionDict } from "./addmul.ohm-bundle";

export const addMulSemantics: AddMulSemantics = grammar.createSemantics() as AddMulSemantics;


const addMulCalc = {
    AddExp_plus(arg0: any, _plus: any, arg1: any) {
        return arg0.calculate() + arg1.calculate();
    },

    MulExp_mul(arg0: any, _times: any, arg1: any) {
        return arg0.calculate() * arg1.calculate();
    },

    PriExp_paren(arg0: any, arg1: any, arg2: any) {
        return arg1.calculate();
    },

    number_whole(arg0: any) {
        return parseInt(this.sourceString, 10);
    }
} satisfies AddMulActionDict<number>

addMulSemantics.addOperation<Number>("calculate()", addMulCalc);

interface AddMulDict extends Dict {
    calculate(): number;
}

interface AddMulSemantics extends Semantics {
    (match: MatchResult): AddMulDict;
}
