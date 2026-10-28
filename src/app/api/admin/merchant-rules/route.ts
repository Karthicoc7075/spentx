import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { adminCheckResponse, rejectCrossSite, requireAdmin } from "@/lib/server/admin-auth";

async function handleDelete(request: Request) {
  try {
    const csrf = rejectCrossSite(request);
    if (csrf) return csrf;

    const check = await requireAdmin();
    if (!check.ok) return adminCheckResponse(check);
    const user = check.user;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    const admin = createAdminClient();

    if (type === "brand") {
      if (!id) {
        return NextResponse.json({ error: "id is required for brand deletion." }, { status: 400 });
      }

      const { data: before } = await admin
        .from("merchant_brands")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!before) {
        return NextResponse.json({ error: "Brand not found." }, { status: 404 });
      }

      await admin.from("merchant_brand_keys").delete().eq("brand_id", id);
      const { error: delErr } = await admin.from("merchant_brands").delete().eq("id", id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      await admin.from("admin_action_logs").insert({
        admin_id: user.id,
        action: "delete",
        table_name: "merchant_brands",
        record_id: id,
        before,
      });

      return NextResponse.json({ ok: true, message: "Brand deleted successfully." });
    }

    if (type === "keyword") {
      if (!id) {
        return NextResponse.json({ error: "id is required for keyword deletion." }, { status: 400 });
      }

      const { data: before } = await admin
        .from("merchant_keyword_rules")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!before) {
        return NextResponse.json({ error: "Keyword rule not found." }, { status: 404 });
      }

      const { error: delErr } = await admin.from("merchant_keyword_rules").delete().eq("id", id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      await admin.from("admin_action_logs").insert({
        admin_id: user.id,
        action: "delete",
        table_name: "merchant_keyword_rules",
        record_id: id,
        before,
      });

      return NextResponse.json({ ok: true, message: "Keyword rule deleted successfully." });
    }

    if (type === "key") {
      const brand_id = searchParams.get("brand_id");
      const key = searchParams.get("key");
      const key_type = searchParams.get("key_type");

      if (!brand_id || !key) {
        return NextResponse.json({ error: "brand_id and key are required for key deletion." }, { status: 400 });
      }

      let query = admin.from("merchant_brand_keys").delete().eq("brand_id", brand_id).eq("key", key);
      if (key_type) {
        query = query.eq("key_type", key_type);
      }
      const { error: delErr } = await query;
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      // Touch brand updated_at to trigger rules_version bump for mobile sync
      await admin
        .from("merchant_brands")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", brand_id);

      await admin.from("admin_action_logs").insert({
        admin_id: user.id,
        action: "delete",
        table_name: "merchant_brand_keys",
        record_id: `${brand_id}:${key}`,
        before: { brand_id, key, key_type },
      });

      return NextResponse.json({ ok: true, message: "Brand key deleted successfully." });
    }

    return NextResponse.json({ error: "Invalid type. Must be 'brand', 'keyword', or 'key'." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

async function handlePost(request: Request) {
  try {
    const csrf = rejectCrossSite(request);
    if (csrf) return csrf;

    const check = await requireAdmin();
    if (!check.ok) return adminCheckResponse(check);
    const user = check.user;

    const body = await request.json();
    const admin = createAdminClient();

    if (body.action === "upsert_key") {
      const { brand_id, key, key_type, match_mode, old_key, old_key_type } = body;
      if (!brand_id || !key || !key_type || !match_mode) {
        return NextResponse.json(
          { error: "brand_id, key, key_type, and match_mode are required." },
          { status: 400 },
        );
      }

      const cleanKey = key.trim();

      // If modifying an existing key and the key name or key type changed, delete old key row first
      if (old_key && (old_key !== cleanKey || (old_key_type && old_key_type !== key_type))) {
        let delQuery = admin.from("merchant_brand_keys").delete().eq("brand_id", brand_id).eq("key", old_key);
        if (old_key_type) delQuery = delQuery.eq("key_type", old_key_type);
        await delQuery;
      }

      // Upsert the new key
      const { error: upsertErr } = await admin.from("merchant_brand_keys").upsert(
        {
          brand_id,
          key: cleanKey,
          key_type,
          match_mode,
        },
        { onConflict: "key,key_type,brand_id" },
      );

      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      }

      // Touch parent brand to bump rules_version trigger
      await admin
        .from("merchant_brands")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", brand_id);

      await admin.from("admin_action_logs").insert({
        admin_id: user.id,
        action: "upsert",
        table_name: "merchant_brand_keys",
        record_id: `${brand_id}:${cleanKey}`,
        after: { brand_id, key: cleanKey, key_type, match_mode },
      });

      return NextResponse.json({ ok: true, message: "Brand key saved successfully." });
    }

    if (body.action === "test_match") {
      const text = (body.text || "").trim();
      if (!text) {
        return NextResponse.json({ error: "Text is required for test matching." }, { status: 400 });
      }

      const upperText = text.toUpperCase();

      // Stage 1: UPI Handle prefix check
      const { data: upiKeys } = await admin
        .from("merchant_brand_keys")
        .select("key, key_type, match_mode, brand_id, merchant_brands(id, canonical_name, category_slug, confidence)")
        .eq("key_type", "upi");

      let matchedUpi: any = null;
      for (const k of upiKeys || []) {
        const upiPattern = k.key.toLowerCase();
        if (text.toLowerCase().includes(upiPattern)) {
          matchedUpi = k;
          break;
        }
      }

      if (matchedUpi) {
        const brand = matchedUpi.merchant_brands;
        return NextResponse.json({
          matched: true,
          stage: "upi_handle",
          brand,
          key: { key: matchedUpi.key, key_type: matchedUpi.key_type, match_mode: matchedUpi.match_mode },
          category: brand?.category_slug || "uncategorized",
          confidence: brand?.confidence ?? 0.95,
          explanation: `Matched UPI handle "${matchedUpi.key}" (prefix) linked to brand "${brand?.canonical_name}".`,
        });
      }

      // Stage 2: Brand Name / Alias detection
      const { data: nameKeys } = await admin
        .from("merchant_brand_keys")
        .select("key, key_type, match_mode, brand_id, merchant_brands(id, canonical_name, category_slug, confidence)")
        .in("key_type", ["alias", "name"]);

      let matchedBrandKey: any = null;
      const sortedKeys = (nameKeys || []).sort((a, b) => b.key.length - a.key.length);
      for (const k of sortedKeys) {
        const keyUpper = k.key.toUpperCase();
        if (k.match_mode === "exact") {
          const words = upperText.split(/[^A-Z0-9]+/);
          if (upperText === keyUpper || words.includes(keyUpper)) {
            matchedBrandKey = k;
            break;
          }
        } else {
          if (upperText.includes(keyUpper)) {
            matchedBrandKey = k;
            break;
          }
        }
      }

      if (matchedBrandKey) {
        const brand = matchedBrandKey.merchant_brands;
        return NextResponse.json({
          matched: true,
          stage: "brand_key",
          brand,
          key: { key: matchedBrandKey.key, key_type: matchedBrandKey.key_type, match_mode: matchedBrandKey.match_mode },
          category: brand?.category_slug || "uncategorized",
          confidence: brand?.confidence ?? 0.9,
          explanation: `Matched brand ${matchedBrandKey.key_type} "${matchedBrandKey.key}" (${matchedBrandKey.match_mode}) for "${brand?.canonical_name}".`,
        });
      }

      // Stage 3: Keyword rules check
      const { data: keywordRules } = await admin
        .from("merchant_keyword_rules")
        .select("*")
        .eq("is_active", true)
        .order("priority", { ascending: false });

      for (const rule of keywordRules || []) {
        const kw = rule.keyword.toLowerCase();
        const textLower = text.toLowerCase();
        let matched = false;

        if (rule.match_type === "word") {
          const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
          matched = regex.test(text);
        } else if (rule.match_type === "contains") {
          matched = textLower.includes(kw);
        } else if (rule.match_type === "prefix") {
          matched = textLower.startsWith(kw);
        } else if (rule.match_type === "regex") {
          try {
            matched = new RegExp(kw, "i").test(text);
          } catch {
            matched = false;
          }
        }

        if (matched) {
          return NextResponse.json({
            matched: true,
            stage: "keyword_rule",
            keyword_rule: rule,
            category: rule.category_slug,
            confidence: 0.75,
            explanation: `Matched keyword rule "${rule.keyword}" (${rule.match_type}, priority ${rule.priority}) -> ${rule.category_slug}.`,
          });
        }
      }

      return NextResponse.json({
        matched: false,
        stage: "none",
        category: "uncategorized",
        confidence: 0,
        explanation: "No UPI handle, brand alias, or keyword rule matched this text.",
      });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const DELETE = withRouteLogging("admin/merchant-rules/delete", "route_handler", handleDelete);
export const POST = withRouteLogging("admin/merchant-rules/post", "route_handler", handlePost);
