exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE cards ADD COLUMN color VARCHAR(7) NULL DEFAULT NULL`);
};
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE cards DROP COLUMN color`);
};
