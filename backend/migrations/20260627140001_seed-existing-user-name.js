exports.up = (pgm) => {
  pgm.sql("UPDATE users SET first_name = 'Rebecca', last_name = 'Uberall' WHERE email = 'rebecca.uberall@netcomm.net'");
};

exports.down = (pgm) => {
  pgm.sql("UPDATE users SET first_name = NULL, last_name = NULL WHERE email = 'rebecca.uberall@netcomm.net'");
};
