# Readings of free-text notes by a language model

Some investigations record what happened in a test as an operator's note, not as a column.
A language model ("SI" in the challenge's words) reads each note ahead of time and writes what it found
to a file in this folder. `pipeline/normalize/si_notes.py` then decides with ordinary code which
readings go into the data. The model is never called during a build.

| File | Source | Fields |
|---|---|---|
| `PSI-26_BASS-notes.json` | `PSI-26_Science Documents_As Run_Test Matrix.xlsx`, sheet `as run matrix`, column "Test Observations and Anomalies (ignited, spread, extinguished, burn time, color, etc.)" | `ignited`, `outcome`, `burnTimeS` |

A mapping turns the readings on with the key `siNotes` (`pipeline/mappings/README.md`).

## Instructions the model follows (version 1)

For each note give, for each of the three fields, a value and the exact words of the note it rests on,
or nothing when the note does not say. Do not guess, and do not use anything but the note.

**`ignited`**
- `true`: the note describes a flame, a burn or an ignition that happened.
- `false`: the note says an ignition was attempted and the sample did not ignite.
- nothing: the note does not say, or the igniter was broken, so the attempt says nothing about the sample.

**`outcome`** (values of the data contract)
- `not-ignited`: as `ignited: false`.
- `burned-out`: the note says the sample or its fuel was consumed, or the flame reached the end of the sample.
- `self-extinguished`: the note says the flame went out by itself, or at a low but finite airflow setting
  ("went out at finite flow", "extinguished at fan 41").
- `flow-terminated`: the note says the flame went out when the airflow or the fan was turned off.
- `other`: the note says nitrogen extinguished or blew out the flame.
- nothing: the note does not say how the flame ended, or says two things ("extinguished/burned out").
- `blowoff` and `disruption` are not used: no note states them as the end of the test.

**`burnTimeS`**
- only a duration the note itself gives for the burn ("~ 40 s burn", "burned for ~ 4.75 min"), in seconds.
- not a time computed from two timestamps, not the time to ignite, not a planned duration.

**Quotes** are copied character for character, typos and double spaces included.

## What the code checks

- the quote is in the note's cell, character for character;
- `outcome` is a value of the contract, `ignited` is a boolean;
- a burn time is the number written in its quote, with its unit;
- `ignited` and `outcome` do not contradict each other;
- the table has no value for the field already.

An accepted value is listed in the row's `inferred`, and the row's `notes` quote the words it rests on.
A rejected reading is written to `data/review/si-notes-rejected.csv` with the reason.

## Limits

The rule that separates `self-extinguished` from `flow-terminated` is the team's reading of the operator's
words. A combustion specialist has not reviewed it. A person should check a sample of the readings
against the matrix before relying on them.
