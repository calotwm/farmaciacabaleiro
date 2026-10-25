import webpush from "web-push";

// Prints a fresh VAPID key pair only. Put the values in the app environment (never commit them).
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:you@example.com   # set your own contact (mailto: or https: URL)");
