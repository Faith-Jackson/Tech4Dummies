import { GoogleGenAI } from "@google/genai";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface VectorEntry {
  id: string;
  text: string;
  embedding: number[];
  metadata: any;
}

class VectorStore {
  private entries: VectorEntry[] = [];

  /**
   * Adds an entry, using Firestore as a cache layer.
   * If an embedding for this lessonId already exists in Firestore, it is
   * loaded directly without calling the Gemini embedding API.
   */
  async addEntry(id: string, text: string, metadata: any = {}) {
    // Skip if already in memory
    if (this.entries.some(e => e.id === id)) return;

    try {
      // --- Check Firestore cache first ---
      const cacheRef = doc(db, 'lessonEmbeddings', id);
      const cached = await getDoc(cacheRef);
      if (cached.exists()) {
        const data = cached.data();
        this.entries.push({ id, text: data.text, embedding: data.embedding, metadata });
        return;
      }

      // --- Cache miss: compute embedding via Gemini API ---
      const result = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: [text],
      });

      const embedding = result.embeddings[0].values;
      this.entries.push({ id, text, embedding, metadata });

      // Persist to Firestore so future sessions skip this call
      await setDoc(cacheRef, { id, text, embedding, metadata, cachedAt: Date.now() });
    } catch (error) {
      console.error("Embedding Error:", error);
    }
  }

  /** Remove a cached embedding when lesson content changes */
  async invalidateCache(id: string) {
    try {
      const cacheRef = doc(db, 'lessonEmbeddings', id);
      await setDoc(cacheRef, { invalid: true }, { merge: true });
      this.entries = this.entries.filter(e => e.id !== id);
    } catch (error) {
      console.error("Cache invalidation error:", error);
    }
  }

  cosineSimilarity(vecA: number[], vecB: number[]) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async search(query: string, limit: number = 3) {
    try {
      const result = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: [query],
      });

      const queryEmbedding = result.embeddings[0].values;

      const scoredEntries = this.entries.map(entry => ({
        ...entry,
        score: this.cosineSimilarity(queryEmbedding, entry.embedding)
      }));

      return scoredEntries
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      console.error("Search Error:", error);
      return [];
    }
  }
}

export const vectorStore = new VectorStore();
