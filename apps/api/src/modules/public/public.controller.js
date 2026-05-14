const { db } = require("../../db/client");
const { generateStoreChatReply } = require("../ai/ai.service");

/** Normalize public URL slug: lowercase, underscores to hyphens (matches DB slugs). */
function normalizePublicStoreSlug(raw) {
  if (raw == null || typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase().replace(/_/g, "-");
  while (s.includes("--")) {
    s = s.replace(/--/g, "-");
  }
  return s.replace(/^-+|-+$/g, "") || "";
}

function listPublicProducts(req, res) {
  try {
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);

    if (!storeSlug) {
      return res.status(400).json({
        message: "storeSlug is required.",
      });
    }

    const store = db
      .prepare(
        `
      SELECT
        id,
        name,
        slug,
        phone,
        delivery_info,
        logo_url,
        theme_color,
        accent_color,
        policy_text
      FROM stores
      WHERE slug = ?
    `
      )
      .get(storeSlug);

    if (!store) {
      return res.status(404).json({
        message: "Store not found.",
      });
    }

    const products = db
      .prepare(
        `
      SELECT id, name, description, image_url, base_price
      FROM products
      WHERE store_id = ? AND is_active = 1
      ORDER BY id DESC
    `
      )
      .all(store.id);

    const productsWithVariants = products.map((product) => {
      const variants = db
        .prepare(
          `
        SELECT id, product_id, size, color, price, stock_qty, sku
        FROM product_variants
        WHERE product_id = ? AND is_active = 1
        ORDER BY id DESC
      `
        )
        .all(product.id);

      return {
        ...product,
        variants,
      };
    });

    return res.status(200).json({
      store,
      products: productsWithVariants,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load public products.",
      error: error.message,
    });
  }
}

function getSpecificProduct(req, res) {
  try {
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);
    const { productId } = req.params;
    const productIdNumber = Number(productId);

    if (!storeSlug) {
      return res.status(400).json({
        message: "storeSlug is required.",
      });
    }

    if (Number.isNaN(productIdNumber) || productIdNumber <= 0) {
      return res.status(400).json({
        message: "productId must be a valid positive number.",
      });
    }

    const store = db
      .prepare(
        `
      SELECT
        id,
        name,
        slug,
        phone,
        delivery_info,
        logo_url,
        theme_color,
        accent_color,
        policy_text
      FROM stores
      WHERE slug = ?
    `
      )
      .get(storeSlug);

    if (!store) {
      return res.status(404).json({
        message: "Store not found.",
      });
    }

    const product = db
      .prepare(
        `
      SELECT id, name, description, image_url, base_price
      FROM products
      WHERE id = ? AND store_id = ? AND is_active = 1
    `
      )
      .get(productIdNumber, store.id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found.",
      });
    }

    const variants = db
      .prepare(
        `
      SELECT id, product_id, size, color, price, stock_qty, sku
      FROM product_variants
      WHERE product_id = ? AND is_active = 1
      ORDER BY id DESC
    `
      )
      .all(productIdNumber);

    return res.status(200).json({
      store,
      product: {
        ...product,
        variants,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not get specific product.",
      error: error.message,
    });
  }
}

function createPublicOrder(req, res) {
  try {
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);
    const { customer, items, customer_note } = req.body;

    if (!storeSlug) {
      return res.status(400).json({
        message: "storeSlug is required.",
      });
    }

    const store = db
      .prepare("SELECT id, name, slug FROM stores WHERE slug = ?")
      .get(storeSlug);
    if (!store) {
      return res.status(404).json({
        message: "Store not found.",
      });
    }

    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({
        message: "customer.name and customer.phone are required.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "items must be a non-empty array.",
      });
    }

    const runCreateOrder = db.transaction((payload) => {
      const customerResult = db
        .prepare(
          `
        INSERT INTO customers (store_id, name, phone, address_text, notes)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(
          store.id,
          String(payload.customer.name).trim(),
          String(payload.customer.phone).trim(),
          payload.customer.address_text ?? null,
          payload.customer.notes ?? null
        );

      const customerId = customerResult.lastInsertRowid;

      const orderResult = db
        .prepare(
          `
        INSERT INTO orders (store_id, customer_id, status, total_amount, delivery_address, customer_note)
        VALUES (?, ?, 'new', 0, ?, ?)
      `
        )
        .run(
          store.id,
          customerId,
          payload.customer.address_text ?? null,
          customer_note ?? null
        );

      const orderId = orderResult.lastInsertRowid;
      let totalAmount = 0;
      let itemsCount = 0;

      for (const item of payload.items) {
        const productId = Number(item.product_id);
        const qty = Number(item.qty);
        const variantId =
          item.variant_id === undefined || item.variant_id === null
            ? null
            : Number(item.variant_id);

        if (Number.isNaN(productId) || productId <= 0) {
          throw new Error("Invalid product_id in items.");
        }
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error("qty must be an integer greater than 0.");
        }

        const product = db
          .prepare(
            `
          SELECT id, base_price
          FROM products
          WHERE id = ? AND store_id = ? AND is_active = 1
        `
          )
          .get(productId, store.id);

        if (!product) {
          throw new Error(`Product ${productId} not found in this store.`);
        }

        let unitPrice = Number(product.base_price);
        let resolvedVariantId = null;

        if (variantId !== null) {
          if (Number.isNaN(variantId) || variantId <= 0) {
            throw new Error("Invalid variant_id in items.");
          }

          const variant = db
            .prepare(
              `
            SELECT id, product_id, price, stock_qty
            FROM product_variants
            WHERE id = ? AND product_id = ? AND is_active = 1
          `
            )
            .get(variantId, productId);

          if (!variant) {
            throw new Error(`Variant ${variantId} is invalid for product ${productId}.`);
          }

          if (variant.stock_qty < qty) {
            throw new Error(`Insufficient stock for variant ${variantId}.`);
          }

          unitPrice =
            variant.price !== null && variant.price !== undefined
              ? Number(variant.price)
              : unitPrice;
          resolvedVariantId = variant.id;

          db.prepare(
            `
            UPDATE product_variants
            SET stock_qty = stock_qty - ?
            WHERE id = ?
          `
          ).run(qty, variant.id);
        }

        if (Number.isNaN(unitPrice) || unitPrice < 0) {
          throw new Error("Invalid item price.");
        }

        const lineTotal = unitPrice * qty;
        totalAmount += lineTotal;
        itemsCount += 1;

        db.prepare(
          `
          INSERT INTO order_items (order_id, product_id, variant_id, qty, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?, ?)
        `
        ).run(orderId, productId, resolvedVariantId, qty, unitPrice, lineTotal);
      }

      db.prepare("UPDATE orders SET total_amount = ? WHERE id = ?").run(
        totalAmount,
        orderId
      );

      return {
        order_id: orderId,
        customer_id: customerId,
        status: "new",
        total_amount: totalAmount,
        items_count: itemsCount,
      };
    });

    const createdOrder = runCreateOrder({ customer, items });

    return res.status(201).json({
      message: "Order created successfully.",
      data: createdOrder,
    });
  } catch (error) {
    return res.status(400).json({
      message: "Could not create order.",
      error: error.message,
    });
  }
}

function createChatSession(req ,res){
  try{
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);
    
    if(!storeSlug){
      return res.status(400).json({message:"storeSlug is required"})
    }

    const storeQuery = db.prepare(`
      SELECT
        id,
        name,
        slug,
        delivery_info,
        ai_prompt,
        logo_url,
        theme_color,
        accent_color,
        policy_text
FROM stores
WHERE slug = ?
      `)

      const store  = storeQuery.get(storeSlug)

        if (!store) {
  return res.status(404).json({
    message: "Store not found.",
  });
}

      const insertSessionQuery  = db.prepare(`
        INSERT INTO chat_sessions (store_id, customer_id, channel, last_message_at)
VALUES (?, NULL, 'web', CURRENT_TIMESTAMP)
        `)

        const result = insertSessionQuery.run(store.id)

        const selectSessionQuery = db.prepare(`
          SELECT id, store_id, customer_id, channel, started_at, last_message_at
FROM chat_sessions
WHERE id = ?
          `)

          const session  = selectSessionQuery.get(result.lastInsertRowid)

          return res.status(201).json({
  message: "Chat session created successfully.",
  data: session,
});

  }catch(err){
    
    return res.status(500).json({
     message: "Could not create chat session.",
      error:err.message
    })
  }
}

async function sendChatMessage(req ,res){
  try{
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);
    const {session_id , message_text} = req.body;

    const sessionId = Number(session_id);
    const messageText = String(message_text || "").trim();

    if(!storeSlug){
      return res.status(400).json({message:"storeSlug is required"})
    }
    if(Number.isNaN(sessionId) || sessionId <= 0){
      return res.status(400).json({message:"there is no session "})
    }
    if(!messageText){
      return res.status(400).json({message:"the message is empty"})
    }

    const storeQuery = db.prepare(`
      SELECT
        id,
        name,
        slug,
        ai_prompt,
        delivery_info,
        policy_text,
        subscription_status
      FROM stores
      WHERE slug = ?
    `);

    const store = storeQuery.get(storeSlug);

      if(!store){
        return res.status(404).json({message:"Store not found."})
      }

      const sessionQuery = db.prepare(`
        SELECT id, store_id, channel
FROM chat_sessions
WHERE id = ? AND store_id = ?`)

const session = sessionQuery.get(sessionId, store.id);

if(!session){
  return res.status(404).json({message:"Chat session not found."})
}

const insertCustomerMessageQuery = db.prepare(
  `INSERT INTO chat_messages (session_id, sender_type, message_text, intent, payload)
VALUES (?, 'customer', ?, NULL, NULL)`
);

const customerMessageResult = insertCustomerMessageQuery.run(session.id, messageText);

const products = db
  .prepare(
    `
      SELECT id, name, description, image_url, base_price
      FROM products
      WHERE store_id = ? AND is_active = 1
      ORDER BY id DESC
    `
  )
  .all(store.id)
  .map((product) => {
    const variants = db
      .prepare(
        `
          SELECT id, product_id, size, color, price, stock_qty, sku
          FROM product_variants
          WHERE product_id = ? AND is_active = 1
          ORDER BY id DESC
        `
      )
      .all(product.id);

    return {
      ...product,
      variants,
    };
  });

const conversationMessages = db
  .prepare(
    `
      SELECT sender_type, message_text
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT 8
    `
  )
  .all(session.id)
  .reverse();

const aiResult = await generateStoreChatReply({
  store,
  products,
  messageText,
  conversationMessages,
});

const aiReplyText = aiResult.reply;
const recommendedIds = Array.isArray(aiResult.recommended_product_ids)
  ? aiResult.recommended_product_ids
  : [];

const payloadStr = JSON.stringify({ recommended_product_ids: recommendedIds });

const insertAiMessageQuery = db.prepare(`
  INSERT INTO chat_messages (session_id, sender_type, message_text, intent, payload)
VALUES (?, 'ai', ?, 'ai_reply', ?)
`);

const aiMessageResult = insertAiMessageQuery.run(session.id, aiReplyText, payloadStr);

  const updateSessionQuery = db.prepare(`
    
    UPDATE chat_sessions
SET last_message_at = CURRENT_TIMESTAMP
WHERE id = ?`);

updateSessionQuery.run(session.id);


const latestMessagesQuery = db.prepare(`
  SELECT id, session_id, sender_type, message_text, intent, payload, created_at
FROM chat_messages
WHERE session_id = ?
ORDER BY id DESC
LIMIT 2`);

  const latestRows = latestMessagesQuery.all(session.id).reverse();

  const latestMessages = latestRows.map((row) => {
    const base = { ...row };
    if (row.sender_type === "ai" && row.payload) {
      try {
        const p = JSON.parse(row.payload);
        const ids = Array.isArray(p.recommended_product_ids) ? p.recommended_product_ids : [];
        base.recommended_product_ids = ids;
        base.recommended_products = ids
          .map((id) => products.find((pr) => Number(pr.id) === Number(id)))
          .filter(Boolean);
      } catch {
        base.recommended_product_ids = [];
        base.recommended_products = [];
      }
    } else {
      base.recommended_product_ids = [];
      base.recommended_products = [];
    }
    return base;
  });

  return res.status(201).json({
  message: "Message sent successfully.",
  data: {
    session_id: session.id,
    messages: latestMessages,
  },
});

  }catch(err){
    return res.status(500).json({
      message:"Could not send chat message.",
      error:err.message
    })
  }
}

function getChatSessionMessages(req , res){
  try{
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);
    const { sessionId } = req.params;
    const chatSessionId = Number(sessionId);

    if(!storeSlug ){
      return res.status(400).json({message:"storeSlug is required."})
    }

    if(Number.isNaN(chatSessionId) || chatSessionId <= 0){
      return res.status(400).json({message:"sessionId must be a valid positive number."})
    }

    const store_query = db.prepare(`
      SELECT id, name, slug
FROM stores
WHERE slug = ?`)

const storeQ = store_query.get(storeSlug)

if(!storeQ){
  return res.status(404).json({message:"Store not found."})
}

      const check_session = db.prepare(
        `SELECT id, store_id, channel, started_at, last_message_at
FROM chat_sessions
WHERE id = ? AND store_id = ?`
      )

      const session = check_session.get(chatSessionId, storeQ.id)

      if(!session){
        return res.status(404).json({message:"Chat session not found."})
      }



      const chat_messages = db.prepare(`
        SELECT id, session_id, sender_type, message_text, intent, payload, created_at
FROM chat_messages
WHERE session_id = ?
ORDER BY id ASC`)

const rows = chat_messages.all(session.id)

const messages = rows.map((row) => {
  const base = { ...row };
  if (row.sender_type === "ai" && row.payload) {
    try {
      const p = JSON.parse(row.payload);
      const ids = Array.isArray(p.recommended_product_ids) ? p.recommended_product_ids : [];
      base.recommended_product_ids = ids;
      const storeProducts = db
        .prepare(
          `
            SELECT id, name, description, image_url, base_price
            FROM products
            WHERE store_id = ? AND is_active = 1
          `
        )
        .all(storeQ.id);
      const withVariants = storeProducts.map((product) => {
        const variants = db
          .prepare(
            `
              SELECT id, product_id, size, color, price, stock_qty, sku
              FROM product_variants
              WHERE product_id = ? AND is_active = 1
              ORDER BY id DESC
            `
          )
          .all(product.id);
        return { ...product, variants };
      });
      base.recommended_products = ids
        .map((id) => withVariants.find((pr) => Number(pr.id) === Number(id)))
        .filter(Boolean);
    } catch {
      base.recommended_product_ids = [];
      base.recommended_products = [];
    }
  } else {
    base.recommended_product_ids = [];
    base.recommended_products = [];
  }
  return base;
});

return res.status(200).json({
  data: {
    session,
    messages,
  },
});





  }catch(err){
     return res.status(500).json({
      message:"Could not load chat messages.",
      error:err.message
    })
  }

}

module.exports = {
  listPublicProducts,
  getSpecificProduct,
  createPublicOrder,
  createChatSession,
  sendChatMessage,
  getChatSessionMessages,
};
