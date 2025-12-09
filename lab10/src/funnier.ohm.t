Funnier <: Funny {

  Module
    := Item+

  Item
    = Function              -- fun
    | Formula               -- formula

  Function
    := Ident
       "(" ParamList ")"
       RequiresSpec?
       RetOrVoid
       EnsuresSpec?
       UsesSpec?
       Stmt

  RetOrVoid
    = RetSpec                -- retSpec
    | "returns" "void"       -- void

  RequiresSpec
    = "requires" Predicate

  EnsuresSpec
    = "ensures" Predicate

  While
    := "while" "(" Condition ")" InvariantSpec? Stmt

  InvariantSpec
    = "invariant" Predicate

  Formula
    = "formula"
      Ident
      "(" ParamList ")"
      "=>"
      Predicate
      ";"

  Predicate
    = OrPred

  OrPred
    = AndPred (("or" | "->") AndPred)*

  AndPred
    = NotPred ("and" NotPred)*

  NotPred
    = ("not")* AtomPred

  AtomPred
    = "true"          -- true
    | "false"         -- false
    | Comparison      -- cmp        
    | Quantifier      -- quant
    | FormulaRef      -- formulaRef
    | ParenPred       -- paren

  ParenPred
    = "(" Predicate ")"

  Quantifier
    = ("forall" | "exists")
      "(" Param "|" Predicate ")"

  FormulaRef
    = Ident "(" ArgList ")"
}