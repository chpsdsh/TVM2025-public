import { ReversePolishNotationActionDict} from "./rpn.ohm-bundle";

export const rpnCalc = {
      Exp_add( arg0: any, arg1: any, arg2: any){
        return arg0.calculate() + arg1.calculate();
      },

      Exp_mul(arg0: any, arg1: any, arg2: any) {
        return arg0.calculate() * arg1.calculate()
      },
      Exp_lit(arg0: any){
            return parseInt(this.sourceString, 10);
      },
      Exp(arg0: any){
        return arg0.calculate()
      },
      number(arg0: any){
        return parseInt(this.sourceString, 10);
      }
} satisfies ReversePolishNotationActionDict<number>;
