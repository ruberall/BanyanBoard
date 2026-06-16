/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.alterColumn('cards', 'position', {
    type: 'float8',
    using: 'position::float8',
    default: 1.0,
  });
};

exports.down = (pgm) => {
  pgm.alterColumn('cards', 'position', {
    type: 'integer',
    using: 'position::integer',
    default: 0,
  });
};
