// Where links, inboxes and reply links are kept. Owner: C.
//
// Settings (in the relay's .env):
//   MONGODB_URI_APP    the Atlas address with the database name in it (MONGODB_URI also works)
//   FAMILY_DRY_RUN=1   keep everything in the relay's memory (TASKS_DRY_RUN=1 does the same)
//
// In the database every collection clears itself: codes after 15 minutes, inbox items after 7 days,
// reply links after 2 days. The relay never stores her secret, only a fingerprint of it.

import { MongoClient, type Collection } from 'mongodb';
import { CODE_MINUTES, INBOX_DAYS, REPLY_DAYS, memoryFamily, type FamilyStore, type InboxItem, type ReplyInfo } from './family';

interface Code { _id: string; inboxId: string; createdAt: Date }
interface Link { _id: string; inboxId: string; createdAt: Date }
interface Item { _id: string; inboxId: string; item: InboxItem; createdAt: Date }
interface Reply { _id: string; info: ReplyInfo; used: number; createdAt: Date }

function mongoFamily(uri: string): FamilyStore {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  let ready: Promise<{ codes: Collection<Code>; links: Collection<Link>; inbox: Collection<Item>; replies: Collection<Reply> }> | null = null;
  const open = () =>
    (ready ??= client.connect().then(async () => {
      const db = client.db();
      const c = { codes: db.collection<Code>('family_codes'), links: db.collection<Link>('family_links'), inbox: db.collection<Item>('family_inbox'), replies: db.collection<Reply>('family_replies') };
      await c.codes.createIndex({ createdAt: 1 }, { expireAfterSeconds: CODE_MINUTES * 60 });
      await c.inbox.createIndex({ createdAt: 1 }, { expireAfterSeconds: INBOX_DAYS * 86_400 });
      await c.inbox.createIndex({ inboxId: 1 });
      await c.links.createIndex({ inboxId: 1 });
      await c.replies.createIndex({ createdAt: 1 }, { expireAfterSeconds: REPLY_DAYS * 86_400 });
      return c;
    }));
  const fresh = (at: Date, ms: number) => Date.now() - at.getTime() < ms; // the database clears old ones about once a minute
  return {
    async putCode(code, inboxId) {
      const { codes } = await open();
      await codes.deleteOne({ _id: code, createdAt: { $lt: new Date(Date.now() - CODE_MINUTES * 60_000) } });
      await codes.insertOne({ _id: code, inboxId, createdAt: new Date() }); // fails if the words are in use, and the caller tries others
    },
    async takeCode(code) {
      const held = await (await open()).codes.findOneAndDelete({ _id: code });
      return held && fresh(held.createdAt, CODE_MINUTES * 60_000) ? held.inboxId : null;
    },
    async putLink(sendId, inboxId) {
      await (await open()).links.insertOne({ _id: sendId, inboxId, createdAt: new Date() });
    },
    async inboxOf(sendId) {
      return (await (await open()).links.findOne({ _id: sendId }))?.inboxId ?? null;
    },
    async countLinks(inboxId) {
      return (await open()).links.countDocuments({ inboxId });
    },
    async unlink(inboxId) {
      await (await open()).links.deleteMany({ inboxId });
    },
    async push(inboxId, item) {
      await (await open()).inbox.insertOne({ _id: item.id, inboxId, item, createdAt: new Date() });
    },
    async list(inboxId) {
      const found = await (await open()).inbox.find({ inboxId }).sort({ createdAt: 1 }).limit(40).toArray();
      return found.map((f) => f.item);
    },
    async ack(inboxId, ids) {
      await (await open()).inbox.deleteMany({ inboxId, _id: { $in: ids } });
    },
    async putReply(replyId, info) {
      await (await open()).replies.insertOne({ _id: replyId, info, used: 0, createdAt: new Date() });
    },
    async getReply(replyId) {
      const held = await (await open()).replies.findOne({ _id: replyId });
      return held && fresh(held.createdAt, REPLY_DAYS * 86_400_000) ? { ...held.info, used: held.used } : null;
    },
    async useReply(replyId) {
      await (await open()).replies.updateOne({ _id: replyId }, { $inc: { used: 1 } });
    },
  };
}

let store: FamilyStore | null | undefined;

/** The one store the relay uses, or null when neither a database nor a dry run is set up. */
export function familyStore(): FamilyStore | null {
  if (store !== undefined) return store;
  const uri = process.env.MONGODB_URI_APP ?? process.env.MONGODB_URI ?? '';
  store = process.env.FAMILY_DRY_RUN === '1' || process.env.TASKS_DRY_RUN === '1' ? memoryFamily() : uri ? mongoFamily(uri) : null;
  return store;
}
