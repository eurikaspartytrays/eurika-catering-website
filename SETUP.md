# Connecting the website to Firebase

This connects the order form to your owner dashboard and replaces the demo PIN with your own email login.
It uses Firebase's free plan. You don't need a credit card. It takes about 15 minutes.

Firebase sometimes moves buttons around. If a screen looks different, look for the same words.

## 1. Create the project
1. Go to <https://console.firebase.google.com> and sign in with the Google account you want to own the orders.
2. Click **Create a project** (or **Add project**). Name it `eurika-orders` and continue.
3. Turn **Google Analytics** off, then click **Create project**. When it's ready, click **Continue**.

## 2. Register the website and copy its settings
1. On the project home page, click the **Web** icon `</>`.
2. App nickname: `Eurika website`. Leave **Firebase Hosting** unticked. Click **Register app**.
3. You'll see `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`.
   Copy the six values into `firebase-config.js` in this repository, replacing each `PASTE_...` value.
   These values are not secret. The security rules protect your orders.

## 3. Create the database
1. Left menu: **Build → Firestore Database → Create database**.
2. Location: **asia-southeast1 (Singapore)**. It's closest to Butuan, and you can't change it later.
3. Choose **Start in production mode**, then **Create**.

## 4. Paste the security rules
1. In Firestore Database, open the **Rules** tab.
2. Delete what's there, paste the whole contents of `firestore.rules` from this repository, and click **Publish**.

## 5. Turn on email login
1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → turn on the first switch only → **Save**.

## 6. Create your owner account
1. **Users** tab → **Add user**. Enter the email and a strong password you'll use to sign in. Then click **Add user**.
2. Copy the **User UID** shown in the list. It's a long code like `aB3dE...`.

## 7. Stop strangers from creating accounts
1. **Settings** tab → **User actions**.
2. Untick **Enable create (sign-up)** and click **Save**.
   (Even if someone did create an account, it couldn't see orders. This just keeps things tidy.)

## 8. Mark your account as the owner
1. **Firestore Database → Data** tab → **Start collection**.
2. Collection ID: `owners` → **Next**.
3. Document ID: paste your **User UID** from step 6.
4. Add a field: name `note`, type `string`, value `Eurika`. Click **Save**.

## 9. Allow your website's address
1. **Authentication → Settings → Authorized domains → Add domain**.
2. Add the address your website is served from, for example `eurikaspartytrays.github.io`, or your own domain.

## 10. Publish and test
1. Commit `firebase-config.js` with your values, then merge this branch so the website updates.
2. On your phone, place a test order. You should see **Order received** with a reference like `EU-7KQ2MD`.
3. On another device, open the **Owner** tab and sign in with your email. The test order appears within a few seconds.
   Cancel it from the dashboard when you're done.

### Optional
- **Lock the API key to your site**: Google Cloud console → APIs & Services → Credentials → *Browser key* → Website restrictions → add your domain.
- **Forgot password**: use the *Forgot password?* button on the sign-in screen.
- **Another staff login**: repeat steps 6 and 8 for that person.

## Running the tests (for developers)
The tests need Node.js, Java 11+ and Playwright with Chromium.
```bash
cd tests
npm install --legacy-peer-deps
npm test
```
They start local Firebase emulators. Nothing touches the real project.
