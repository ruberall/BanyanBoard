exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE cards ALTER COLUMN labels TYPE jsonb USING to_jsonb(labels), ALTER COLUMN labels SET DEFAULT '[]'::jsonb`);
};
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE cards ALTER COLUMN labels TYPE text[] USING ARRAY(SELECT jsonb_array_elements_text(labels)), ALTER COLUMN labels SET DEFAULT '{}'::text[]`);
};
