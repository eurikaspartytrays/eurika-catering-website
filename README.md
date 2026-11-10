# Eurika Catering Website

Online ordering for Eurika's Party Trays, Catering & Events, Butuan City.

- `index.html`: the whole site (menu, cart, checkout, catering quotes, owner dashboard).
- `firebase-config.js`: your Firebase web settings. See **[SETUP.md](SETUP.md)**.
- `firestore.rules`: who can do what. Customers can only submit orders. Only owner accounts can read or manage them.
- `tests/`: security-rule and browser tests that run against local Firebase emulators.
