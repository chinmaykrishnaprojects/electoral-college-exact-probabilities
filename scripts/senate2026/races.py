"""2026 Senate race registry: state -> (series, event, R-market ticker, incumbent party, label)."""
# Not up in 2026: R 31, D-caucus 34 (incl. King, Sanders). VP Vance breaks ties -> R controls at >=50.
R_HOLDOVER, D_HOLDOVER = 31, 34

RACES = [
    # st, series, R ticker, held_by, R candidate, D/indep main challenger
    ("AL", "SENATEAL", "SENATEAL-26-R", "R", "Moore", "Wess"),
    ("AK", "SENATEAK", "SENATEAK-26-R", "R", "Sullivan", "Peltola"),
    ("AR", "SENATEAR", "SENATEAR-26-R", "R", "Cotton", "Shoffner"),
    ("CO", "SENATECO", "SENATECO-26-R", "D", "Baisley", "Hickenlooper"),
    ("DE", "SENATEDE", "SENATEDE-26-R", "D", "Katz", "Coons"),
    ("FL", "SENATEFLS", "SENATEFLS-26-R", "R", "Moody", "Nixon"),
    ("GA", "SENATEGA", "SENATEGA-26-R", "D", "Collins", "Ossoff"),
    ("ID", "SENATEID", "SENATEID-26-R", "R", "Risch", "Achilles (I)"),
    ("IL", "SENATEIL", "SENATEIL-26-R", "D", "Tracy", "Stratton"),
    ("IA", "SENATEIA", "SENATEIA-26-R", "R", "Hinson", "Turek"),
    ("KS", "SENATEKS", "SENATEKS-26-R", "R", "Marshall", "Hamilton"),
    ("KY", "SENATELA", "SENATELA-26-R", "R", "Barr", "Booker"),
    ("LA", "KXSENATELA", "KXSENATELA-26NOV-R", "R", "Letlow", "Davis"),
    ("ME", "SENATEME", "SENATEME-26-R", "R", "Collins", "Jackson"),
    ("MA", "SENATEMA", "SENATEMA-26-R", "D", "Deaton", "Markey"),
    ("MI", "SENATEMI", "SENATEMI-26-R", "D", "Rogers", "El-Sayed"),
    ("MN", "SENATEMN", "SENATEMN-26-R", "D", "Tafoya", "Flanagan"),
    ("MS", "SENATEMS", "SENATEMS-26-R", "R", "Hyde-Smith", "Colom"),
    ("MT", "SENATEMT", "SENATEMT-26-R", "R", "Alme", "Bodnar (I)"),
    ("NE", "SENATENE", "SENATENE-26-R", "R", "Ricketts", "Osborn (I)"),
    ("NH", "SENATENH", "SENATENH-26-R", "D", "Sununu", "Pappas"),
    ("NJ", "SENATENJ", "SENATENJ-26-R", "D", "Murphy", "Booker"),
    ("NM", "SENATENM", "SENATENM-26-R", "D", "Marker", "Luján"),
    ("NC", "SENATENC", "SENATENC-26-R", "R", "Whatley", "Cooper"),
    ("OH", "SENATEOHS", "SENATEOHS-26-R", "R", "Husted", "Brown"),
    ("OK", "SENATEOK", "SENATEOK-26-R", "R", "Hern", "Thomas"),
    ("OR", "SENATEOR", "SENATEOR-26-R", "D", "Smith", "Merkley"),
    ("RI", "SENATERI", "SENATERI-26-R", "D", "McKay", "Reed"),
    ("SC", "SENATESC", "SENATESC-26-R", "R", "Graham", "Andrews"),
    ("SD", "SENATESD", "SENATESD-26-R", "R", "Rounds", "Bengs (I)"),
    ("TN", "SENATETN", "SENATETN-26-R", "R", "Hagerty", "Bradshaw"),
    ("TX", "SENATETX", "SENATETX-26-R", "R", "Paxton", "Talarico"),
    ("VA", "SENATEVA", "SENATEVA-26-R", "D", "Mizusawa", "Warner"),
    ("WV", "SENATEWV", "SENATEWV-26-R", "R", "Capito", "Anderson"),
    ("WY", "SENATEWY", "SENATEWY-26-R", "R", "Hageman", "Byrd"),
]
assert len(RACES) == 35
assert sum(r[3] == "R" for r in RACES) == 22
