import { createRxDatabase, type RxCollection, type RxDatabase } from "rxdb";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { addInput, deleteInput, listInputs } from "./api";
import { inputCollectionSchema, type InputItem } from "../shared/inputs";

type InputsCollections = {
  entries: RxCollection<InputItem>;
};

let dbPromise: Promise<RxDatabase<InputsCollections>> | undefined;

const getDatabase = async (): Promise<RxDatabase<InputsCollections>> => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await createRxDatabase<InputsCollections>({
        name: "quick-input-nest-rxdb",
        storage: getRxStorageMemory(),
        ignoreDuplicate: true,
      });

      await db.addCollections({
        entries: {
          schema: inputCollectionSchema,
        },
      });

      return db;
    })();
  }

  return dbPromise;
};

const getEntriesCollection = async (): Promise<RxCollection<InputItem>> => {
  const db = await getDatabase();
  return db.collections.entries;
};

const replaceEntries = async (items: InputItem[]): Promise<void> => {
  const collection = await getEntriesCollection();
  const docs = await collection.find().exec();
  await Promise.all(docs.map((doc) => doc.remove()));

  if (items.length > 0) {
    await collection.bulkInsert(items);
  }
};

export const syncEntries = async (): Promise<InputItem[]> => {
  const items = await listInputs();
  await replaceEntries(items);
  return items;
};

export const watchEntries = async (onEntries: (items: InputItem[]) => void): Promise<() => void> => {
  const collection = await getEntriesCollection();
  const query = collection.find({
    sort: [{ index: "desc" }],
  });

  const subscription = query.$.subscribe((docs) => {
    onEntries(docs.map((doc) => doc.toJSON() as InputItem));
  });

  return () => subscription.unsubscribe();
};

export const createEntry = async (text: string): Promise<void> => {
  await addInput({ text });
  await syncEntries();
};

export const removeEntry = async (index: number): Promise<void> => {
  await deleteInput({ index });
  await syncEntries();
};

