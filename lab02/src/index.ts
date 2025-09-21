import grammar from "./rpn.ohm-bundle";
import { rpnSemantics } from "./semantics";
import { MatchResult } from "ohm-js";
import { StackDepth } from "./stackDepth";

export function evaluate(source: string): number {
    return calculate(parse(source))
}
export function maxStackDepth(source: string): number {
   return stackDepth(parse(source)).max
}

export class SyntaxError extends Error {
}

function parse(content: string): MatchResult {
    const match = grammar.match(content);
    if (match.failed()) {
        throw new SyntaxError(match.message)
    }
    return match;
}

function calculate(expression: MatchResult): number {
    return rpnSemantics(expression).calculate();
}

function stackDepth(expression: MatchResult): StackDepth{
    return rpnSemantics(expression).stackDepth;
}