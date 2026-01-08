---

# GiraStyle: The Agentic Fashion Layer

**Tagline:** Styling isn’t a luxury. It’s an everyday utility.

---

## 1. Product Requirements Document (PRD)

### 1.1 Objective & Strategic Goals

GiraStyle is an autonomous AI agent designed to eliminate the "Imagination Gap" in fashion e-commerce. It leverages the Google Gemini 3 ecosystem to provide personalized, multimodal styling advice that reduces return rates and increases Average Order Value (AOV).

### 1.2 Target User Personas

**The Intent-Driven Shopper:**
Needs to know how to style a specific new item for a work or social event.
Example:

> "I'm going to the de Young museum for a date tonight. What should I wear?"

**The Closet Optimizer:**
Wants to refresh their wardrobe by mixing current items with new Aritzia pieces.
Example:

> "Show me new Aritzia tops that would look good with my existing black denim skirt and brown boots."

### 1.3 Feature Specifications

**Style DNA Quiz (Cold Start Solution):**
A 5-question onboarding flow that establishes the user's "Fashion Persona" (e.g., "Minimalist Chic," "Experimental Edge," "Soft Romantic," "Vintage Preppy").

**Multimodal Closet Grounding:**
Users upload a photo of an item they own. Gemini 3 Vision identifies the silhouette and color to ground all recommendations.

**Retail RAG (Vertex AI):**
Dynamic connection to the Aritzia catalog via GCS bucket ingestion for up-to-the-minute inventory accuracy.

**Generative Lookbook:**
High-fidelity static outfits via Nano Banana and 3-second motion previews via Veo 3.1 Fast.

### 1.4 Technical Architecture & Lifecycle

**Reasoning Engine:** Gemini 3 Flash (Streaming)
**Image Generation:** Nano Banana Pro
**Motion Generation:** Veo 3.1
**Data Warehouse:** BigQuery (Tracking styling interactions and cart conversions)

---

## Business Plan

## Business Plan

### The Market Problem: The Styling Gap

Current fashion e-commerce is optimized for logistics, not inspiration. While platforms are excellent at delivering a specific item, they fail to address the fundamental psychological barrier in the customer journey: The Styling Gap.

**The Single-Item Silo:**
Traditional e-commerce sells clothes in isolation. Unlike fashion bloggers who curate full aspirational "pictures," online stores force shoppers to build outfits in their heads, leading to "Style Uncertainty" and lower conversion.

**The "Orphaned Item" Problem:**
High-margin pieces (e.g., a Babaton Blazer are often left in the cart because shoppers cannot visualize how they pair with their existing wardrobe. This "orphaning" is the primary barrier to higher Average Order Value (AOV).

**The Influence Deficit:**
Retailers lack the tech to scale the "Personal Stylist" experience. Without a professional way to piece items together at the point of sale, shoppers buy single, safe items rather than full, styled looks, capping the retailer's revenue potential.

### The GiraStyle Solution

We provide a B2B2C Styling Layer. We sell a white-labeled agentic API to premium retailers. This moves styling from a manual, elite luxury to an automatic, everyday utility for every consumer.

### Strategic Roadmap

**Phase 1 (Hackathon MVP):**
Launch a generative styling agent using Gemini 3 that builds full outfits based on a Style DNA Quiz and multimodal closet uploads.

**Phase 2 (Enterprise Expansion):**
Scale via CRM Integration to leverage purchase history and wishlists for hyper-personalized, predictive styling recommendations.

**Phase 3 (Ambient Intelligence):**
Future-proof the platform by integrating with AR wearables and Project Astra for real-time, hands-free styling advice in physical spaces.

### Competitive Landscape: The Shift to Agentic Fashion

The fashion AI market is currently dominated by automated merchandising (Phase 1) and is rapidly shifting toward conversational agents (Phase 2). GiraStyle enters this space as a "Phase 2" leader, focused on multimodal reasoning and motion-based confidence.

### The "GiraStyle" Competitive Moat

**Reasoning vs. Tagging:**
Competitors like YesPlz AI and Vue.ai rely on tags (e.g., "silk," "blue"). GiraStyle uses Gemini 3 to understand Human Context (e.g., "I need a look for an outdoor wedding that feels modern but respects the traditional dress code").

**Full-Look Cohesion vs. Single-Item Discovery:**
While Daydream excels at conversational search for a single item, GiraStyle provides the styling logic to assemble a complete, multi-category outfit. We solve the "cohesion problem," ensuring every piece—from the blazer to the boots—works together visually and contextually.

**Motion-Confidence (The "Veo" Edge):**
While Stylitics provides static grids, GiraStyle generates dynamic video previews. This is the only way to solve the "Drape & Movement" concern, which is the leading cause of fashion returns.

**User-Grounded Agency:**
Unlike Findmine, which only "sees" the store's stock, GiraStyle "sees" the user's actual closet via multimodal uploads. This turns a shopping tool into a daily closet utility.

---

## Revenue Model

**Platform Fee:**
Monthly subscription for API access.

**Success Commission:**
1.5% of sales generated through the "Agentic Add-to-Cart."

**Data Insights:**
Premium dashboard showing retailers what items users are struggling to style.

---

## Tech Arch

### A. Generative Pipeline (The UX)

**Reasoning Engine:** Gemini 3 Flash (Streaming)
Role: Orchestrates the conversation and styling logic. Streaming ensures text responses appear in < 2 seconds, maintaining a high-performance "Pro-Stylist" feel.

**Image Generation:** Nano Banana Pro
Role: Generates the high-fidelity "Outfit Card" based on the reasoned styling choices.

**Motion Generation:** Veo 3.1 Fast
Role: Uses the Nano Banana output as a reference frame to create a 3-second motion loop of the fabric drape and movement.

### B. Hybrid Data Layer (The Intelligence)

**Catalog Ingestion (GCS + Vertex AI):**
Google Cloud Storage (GCS) acts as the Unstructured Data Lake. It stores the raw Aritzia product images and your weekly JSONL catalog dump, which is formatted for easy indexing by Vertex AI for e-commerce.

Vertex AI Agent Builder connects directly to GCS, automatically re-indexing the catalog into the Vector Search Engine to ensure recommendations are always "in-stock."

**Data Warehouse & Behavioral Analytics (BigQuery):**
BigQuery serves as the Structured Insights Engine. It captures "Agentic Interaction Logs" (clicks, likes, add-to-carts, and discarded suggestions).

**Phase 2 Enablement:**
BigQuery integrates with retailer CRM data. It joins Purchase History and Wishlists with agent logs to power high-precision personalization through BigQuery ML.

### C. Observability & ROI Tracking

**Looker Studio Dashboard:**
Directly visualizes BigQuery datasets to provide Aritzia with real-time ROI metrics, specifically tracking the Return Reduction Rate (comparing "Agent-Assisted" purchases vs. standard checkout). 

---