# Separate crew first and last names

The user requested separate “Jméno” and “Příjmení” inputs in the new-member form. The same shared form edits saved members. Keep full-name presentation elsewhere and the 250 CZK/h default unchanged.

Use the existing profiles.first_name and profiles.last_name columns; no database migration or backend deployment. Carry these as optional firstName/lastName on Contractor, retaining name for existing consumers and legacy fixtures. mapContractor must preserve exact saved component boundaries. The form edits both components independently and composes the display name; entering the surname first or deleting one component must not move text into the other input.

Use one small shared resolver for structured parts and legacy full names. Prefer explicitly supplied components, including empty strings. For legacy full-name-only values, retain the service's existing all-but-last-token / last-token interpretation for multiple words, with a single word becoming firstName and an empty lastName. Never infer boundaries again when structured values exist. Trim component edges at save, retain words inside each component, and store each component in its existing database column. Preserve current validation requirements, saved rates, identity, notes and billing fields. No bulk updates.

On mobile the fields stack; on wider screens they share a row. Give both Czech labels proper input associations and given-name/family-name autocomplete. Keep current styling and other form sections.

Acceptance: real form creation and editing; surname-first typing and clearing; preserved compound given/surname boundaries after hydration and save; legacy values still editable without duplicating a mononym; existing rate and invitation behavior unaffected. Verify the actual test-preview form, integrate into synchronized main, and refresh normal simulator/phone development installations per AGENTS.md. Tally and real invitations remain disabled.
