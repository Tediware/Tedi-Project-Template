# Document shapes

<!-- The JSON shapes this app exchanges with Tediware. Outbound shapes are
what your outbound mappings read; inbound shapes are what lib/handle-inbound.ts
translates delivered documents into. The source of truth is the zod schemas
in code; this file mirrors them for people. If they disagree, the code wins.
-->

## Design rules

1. Field names are your domain's plain language. No EDI vocabulary: no
   segment names, element positions or qualifier codes.
2. Nothing exists only because one partner's spec asks for it. Partner
   requirements are met in the Tediware mapping, or by a genuinely generic
   field here.
3. Adding a partner should need no change to these shapes. If a new partner
   cannot be mapped into them, decide case by case whether it is a mapping
   problem or a missing generic field.

## Conventions

- Dates without a time are ISO calendar dates: `"2026-07-06"`.
- Timestamps carry a zone: `"2026-07-06T14:30:00Z"`.
- Money is a decimal number in the document's currency, not minor units.

## Shapes

<!-- One section per shape: a field table (name, type, required, notes) and a
complete example. -->
