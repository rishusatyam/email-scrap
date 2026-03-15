# Template-Based Extraction Flow

## Overview

Replaced rule-based extraction (using "between"/"after" patterns) with a simpler template-based approach where the LLM annotates email text with placeholders.

## New Architecture

### Flow

```
Email + Schema → LLM → Annotated Template → Template Matcher → Extracted Values → Structured Data
```

### Step-by-Step Process

1. **LLM Service** (`generateTemplate`)
   - Input: Raw email body + schema
   - Output: Annotated template with `{fieldPath}` placeholders
   - Example: `"Bus ID: {bookingId}\nOperator: {bus.operator}"`

2. **Template Matcher** (`extractValues`)
   - Input: Original email + annotated template
   - Output: Flat key-value pairs `{ "bookingId": "NU123", "bus.operator": "XYZ" }`
   - Uses fuzzy matching (normalizes whitespace)

3. **Build Nested Object** (`buildNestedObject`)
   - Input: Flat extracted values
   - Output: Nested structure `{ bookingId: "NU123", bus: { operator: "XYZ" } }`

4. **Data Cleaner** (existing)
   - Cleans extracted values

5. **Type Converter** (existing)
   - Applies schema types (string → number, date-time, etc.)

6. **Schema Filler** (existing)
   - Fills missing required fields with defaults

## Key Components

### `LLMService.generateTemplate()`
- Simplified prompt: just annotate values with placeholders
- No complex boundary selection logic
- No single-word boundary issues

### `TemplateMatcherUtil.extractValues()`
- Normalizes whitespace for fuzzy matching
- Finds placeholders in template
- Extracts corresponding values from email using context matching
- Handles spacing variations automatically

### `TemplateRuleDAO`
- Stores templates in database (cached per provider)
- First email from provider → generates template
- Subsequent emails → uses cached template

## Benefits

✅ **Simpler LLM task** - just mark where data is, don't design complex rules
✅ **No boundary issues** - no more single-word boundary problems
✅ **Better accuracy** - LLM sees exact context around each value
✅ **Fuzzy matching** - handles spacing/formatting variations
✅ **Reusable** - templates cached per provider
✅ **Clean code** - clear separation of concerns

## Example

**Input Email:**
```
MakeMyTrip Bus ID: NU710981159765578
Bus Operator: New Himalaya Travels
From: Nadaun
To: Delhi
```

**LLM Output (Annotated Template):**
```
MakeMyTrip Bus ID: {bookingId}
Bus Operator: {bus.operator}
From: {departure.city}
To: {arrival.city}
```

**Template Matcher Output:**
```json
{
  "bookingId": "NU710981159765578",
  "bus.operator": "New Himalaya Travels",
  "departure.city": "Nadaun",
  "arrival.city": "Delhi"
}
```

**Final Structured Output:**
```json
{
  "bookingId": "NU710981159765578",
  "bus": {
    "operator": "New Himalaya Travels"
  },
  "departure": {
    "city": "Nadaun"
  },
  "arrival": {
    "city": "Delhi"
  }
}
```

## Files Modified

- `src/mapper/types/index.ts` - New types: `AnnotatedTemplate`, `ExtractedValues`
- `src/mapper/services/llm.service.ts` - New method: `generateTemplate()`
- `src/mapper/utils/template-matcher.util.ts` - **NEW FILE** - Template matching logic
- `src/mapper/services/mapper.service.ts` - Updated flow to use template-based extraction
- `src/mapper/dao/template-rule.dao.ts` - Updated to store templates instead of rules

## Files No Longer Used

- `src/mapper/utils/rule-engine.util.ts` - Replaced by template matcher
- `src/mapper/utils/extraction.util.ts` - Replaced by template matcher
