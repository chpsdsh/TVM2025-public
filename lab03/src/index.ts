import {  MatchResult } from "ohm-js";
import grammar  from "./arith.ohm-bundle";
import { arithSemantics } from "./calculate";

export const arithGrammar = grammar;
export {ArithmeticActionDict, ArithmeticSemantics} from './arith.ohm-bundle';

export function evaluate(content: string, params?: {[name:string]:number}): number
{
    return calculate(parse(content), params ?? {});
}
export class SyntaxError extends Error
{
}

export function parse(content: string): MatchResult
{
     const m = grammar.match(content, "Expr");
  if (!m.succeeded()) {
    // m.message у Ohm даёт человекочитаемое сообщение
    throw new SyntaxError(m.message ?? "Syntax error");
  }
  return m;
}

function calculate(expression: MatchResult, params: {[name:string]: number}): number
{
    return arithSemantics(expression).calculate(params)
}