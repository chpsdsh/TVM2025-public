import { MatchResult } from 'ohm-js';
import { arithGrammar, ArithmeticActionDict, ArithmeticSemantics, SyntaxError } from '../../lab03';
import { Expr } from './ast';

export const getExprAst: ArithmeticActionDict<Expr> = {
  Expr(this: any, addExp: any): Expr {
    return addExp.parse();
  },

  AddExp(this: any, first: any, ops: any, terms: any): Expr {
    let node: Expr = first.parse();

    const opNodes = ops.children;    
    const termNodes = terms.children; 

    for (let i = 0; i < opNodes.length; i++) {
      const op = opNodes[i].sourceString;         
      const rhs: Expr = termNodes[i].parse();     
      node = op === "+"
        ? { kind: "Add", left: node, right: rhs }
        : { kind: "Sub", left: node, right: rhs };
    }
    return node;
  },

  MulExp(this: any, first: any, ops: any, terms: any): Expr {
    let node: Expr = first.parse();

    const opNodes = ops.children;     
    const termNodes = terms.children; 

    for (let i = 0; i < opNodes.length; i++) {
      const op = opNodes[i].sourceString;        
      const rhs: Expr = termNodes[i].parse();    
      node = op === "*"
        ? { kind: "Mul", left: node, right: rhs }
        : { kind: "Div", left: node, right: rhs };
    }
    return node;
  },

  Unary_neg(this: any, minusTok: any, unary: any): Expr {
    return { kind: "Neg", expr: unary.parse() };
  },

  Unary_prim(this: any, priExp: any): Expr {
    return priExp.parse();
  },

  Unary(this: any, unary: any): Expr {
    return unary.parse();
  },

  PriExp_paren(this: any, lparen: any, addExp: any, rparen: any): Expr {
    return addExp.parse();
  },

  PriExp(this: any, prim: any): Expr {
    return prim.parse();
  },

  variable(this: any, head: any, tail: any): Expr {
    return { kind: "Var", name: this.sourceString };
  },

  number(this: any, digits: any): Expr {
    return { kind: "Num", value: Number(this.sourceString) };
  },
};


export const semantics = arithGrammar.createSemantics();

semantics.addOperation("parse()", getExprAst);

export interface ArithSemanticsExt extends ArithmeticSemantics
{
    (match: MatchResult): ArithActionsExt
}

export interface ArithActionsExt 
{
    parse(): Expr
}

export function parseExpr(source: string): Expr {
 
  const m = arithGrammar.match(source);
  if (!m.succeeded()) {
    throw new SyntaxError(m.message);
  }
  const s = (semantics as ArithSemanticsExt)(m);
  return s.parse();
}



    