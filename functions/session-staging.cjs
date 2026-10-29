// This entry point is packaged with authSession.js; no other function or SMTP secret.
const admin = require("firebase-admin");
const projectId = "fertiliapp-staging";
const runtimeProject = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const firebaseProject = JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId;
if ((runtimeProject && runtimeProject !== projectId) ||
    (firebaseProject && firebaseProject !== projectId)) {
  throw new Error("Staging sessionApi cannot run in another project");
}
admin.initializeApp({projectId});
const {createSessionApi} = require("./authSession");
exports.sessionApi = createSessionApi({
  region: "us-central1",
  serviceAccount: "session-api@fertiliapp-staging.iam.gserviceaccount.com",
  minInstances: 0,
  maxInstances: 2,
  invoker: "public",
});
