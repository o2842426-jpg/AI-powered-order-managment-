const Stripe = require("stripe");
const { db } = require("../../db/client");

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !String(key).trim()) {
    return null;
  }
  return new Stripe(key);
}

function mapStripeStatus(status) {
  if (status === "active" || status === "trialing") {
    return status;
  }
  if (status === "past_due") {
    return "past_due";
  }
  return "canceled";
}

function updateStoreSubscriptionFields({
  storeId,
  customerId,
  subscriptionId,
  stripeStatus,
  currentPeriodEndUnix,
}) {
  const mapped = mapStripeStatus(stripeStatus);
  const endIso =
    currentPeriodEndUnix != null
      ? new Date(Number(currentPeriodEndUnix) * 1000).toISOString()
      : null;

  db.prepare(
    `
      UPDATE stores
      SET
        stripe_customer_id = COALESCE(?, stripe_customer_id),
        stripe_subscription_id = ?,
        subscription_status = ?,
        subscription_current_period_end = ?
      WHERE id = ?
    `
  ).run(customerId, subscriptionId, mapped, endIso, storeId);
}

async function handleCheckoutSessionCompleted(session) {
  const stripe = getStripe();
  if (!stripe) return;

  const storeId = Number(session.metadata?.store_id);
  if (!storeId) return;

  const subscriptionId = session.subscription;
  const customerId = session.customer;
  if (!subscriptionId || !customerId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  updateStoreSubscriptionFields({
    storeId,
    customerId,
    subscriptionId: subscription.id,
    stripeStatus: subscription.status,
    currentPeriodEndUnix: subscription.current_period_end,
  });
}

async function handleSubscriptionUpdated(subscription) {
  const storeRow = db
    .prepare(
      `
        SELECT id
        FROM stores
        WHERE stripe_subscription_id = ?
      `
    )
    .get(subscription.id);

  let storeId = storeRow?.id;

  if (!storeId && subscription.metadata?.store_id) {
    storeId = Number(subscription.metadata.store_id);
  }

  if (!storeId) return;

  updateStoreSubscriptionFields({
    storeId,
    customerId: subscription.customer,
    subscriptionId: subscription.id,
    stripeStatus: subscription.status,
    currentPeriodEndUnix: subscription.current_period_end,
  });
}

function handleSubscriptionDeleted(subscription) {
  db.prepare(
    `
      UPDATE stores
      SET subscription_status = 'canceled'
      WHERE stripe_subscription_id = ?
    `
  ).run(subscription.id);
}

async function handleStripeWebhook(req, res) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return res.status(500).json({ message: "Stripe webhook is not configured." });
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (error) {
    return res.status(400).send(`Webhook signature failed: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription") {
          await handleCheckoutSessionCompleted(session);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        await handleSubscriptionUpdated(event.data.object);
        break;
      }
      case "customer.subscription.deleted": {
        handleSubscriptionDeleted(event.data.object);
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(500).json({
      message: "Webhook handler failed.",
      error: error.message,
    });
  }
}

module.exports = {
  handleStripeWebhook,
};
