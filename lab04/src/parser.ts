import { MatchResult } from 'ohm-js';
import { arithGrammar, ArithmeticActionDict, ArithmeticSemantics, SyntaxError } from '../../lab03';
import { Expr } from './ast';

export const getExprAst: ArithmeticActionDict<Expr> = {
  Expr(this: any, add: any): Expr {
    return add.parse();
  },

AddExp(this: any, first: any, opsIter: any, termsIter: any): Expr {
  let node: Expr = first.parse();

  const ops = opsIter.children;     
  const terms = termsIter.children; 

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i].sourceString;      
    const rhs: Expr = terms[i].parse();  
    node = op === "+"
      ? { kind: "Add", left: node, right: rhs }
      : { kind: "Sub", left: node, right: rhs };
  }
  return node;
},

MulExp(this: any, first: any, opsIter: any, termsIter: any): Expr {
  let node: Expr = first.parse();

  const ops = opsIter.children;     
  const terms = termsIter.children; 

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i].sourceString;      
    const rhs: Expr = terms[i].parse();  
    node = op === "*"
      ? { kind: "Mul", left: node, right: rhs }
      : { kind: "Div", left: node, right: rhs };
  }
  return node;
},


  Unary_neg(this: any, _minus: any, u: any): Expr {
    return { kind: "Neg", expr: u.parse() };
  },

  
  Unary_prim(this: any, p: any): Expr {
    return p.parse();
  },

  Unary(this: any, n: any): Expr {
    return n.parse();
  },

  PriExp_paren(this: any, _l: any, e: any, _r: any): Expr {
    return e.parse();
  },

  PriExp(this: any, n: any): Expr {
    return n.parse();
  },

  variable(this: any, _h: any, _t: any): Expr {
    return { kind: "Var", name: this.sourceString };
  },

  number(this: any, _ds: any): Expr {
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



    
