/**
 * Stage 6.11E.4 — Team Profile + Team Member OWNER API selftest.
 * Run: pnpm stage-6.11e4-team-roster-api:selftest
 * No production mutation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTemplate,
  listSelectableTemplates,
  TEAM_SIGNATURE_TEMPLATE_ID,
} from "@/lib/tenancy/templates";
import {
  isAcceptedTeamMemberPhotoUrl,
  normalizeAboutText,
  normalizeServiceAreas,
  normalizeTeamMemberWriteFields,
  validateTeamMemberForPublication,
  TEAM_ABOUT_TEXT_MAX,
  TEAM_SERVICE_AREA_MAX_COUNT,
} from "@/lib/tenancy/team-roster";
import { OwnerActivationError } from "@/lib/platform/activation";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  console.log("\n=== STAGE 6.11E.4 — TEAM ROSTER OWNER APIs ===\n");

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(listSelectableTemplates().length, 2);
    console.log("[0] selectable remains false... PASS");
  }

  {
    const manage = read("src/lib/tenancy/team-roster/manage.ts");
    assert.ok(manage.includes("requireHostBoundOwnerOnboardingContext"));
    assert.ok(!/prisma\.\$transaction\s*\(/.test(manage));
    assert.ok(!/\.\$transaction\s*\(/.test(manage));
    assert.ok(!/\.updateMany\s*\(/.test(manage));
    assert.ok(!manage.includes("WorkspaceSeatQuota"));
    assert.ok(!manage.includes("seatQuota"));
    assert.ok(!manage.includes("membershipId"));
    assert.ok(!/userId:\s*fields|data:\s*\{[^}]*userId/.test(manage));
    assert.ok(manage.includes("leaderMemberId"));
    assert.ok(manage.includes("leaderMemberId: null"));
    assert.ok(!manage.includes("data: { isLeader"));
    assert.ok(!manage.includes("isLeader: true"));
    assert.ok(!manage.includes("isLeader: false"));
    for (const route of [
      "src/app/api/onboarding/team-profile/route.ts",
      "src/app/api/onboarding/team-members/route.ts",
      "src/app/api/onboarding/team-members/[memberId]/route.ts",
    ]) {
      const src = read(route);
      assert.ok(src.includes("platformOk"));
      assert.ok(src.includes("OwnerActivationError"));
      assert.ok(!src.includes("requireOwnerUser"));
      assert.ok(!/\$transaction\s*\(/.test(src));
      assert.ok(!/\.updateMany\s*\(/.test(src));
    }
    console.log("[1] host-bound authority + Neon HTTP safety... PASS");
  }

  {
    assert.equal(normalizeAboutText("  hello  "), "hello");
    assert.equal(normalizeAboutText("   "), null);
    assert.throws(
      () => normalizeAboutText("x".repeat(TEAM_ABOUT_TEXT_MAX + 1)),
      (e: unknown) =>
        e instanceof OwnerActivationError && e.code === "ABOUT_TEXT_TOO_LONG",
    );
    const areas = normalizeServiceAreas([
      " Toronto ",
      "toronto",
      "",
      "Mississauga",
    ]);
    assert.deepEqual(areas, ["Toronto", "Mississauga"]);
    assert.throws(
      () =>
        normalizeServiceAreas(
          Array.from({ length: TEAM_SERVICE_AREA_MAX_COUNT + 1 }, (_, i) =>
            `Area ${i}`,
          ),
        ),
      (e: unknown) =>
        e instanceof OwnerActivationError &&
        e.code === "SERVICE_AREAS_TOO_MANY",
    );
    console.log("[2] Team Profile validation/limits... PASS");
  }

  {
    assert.throws(
      () =>
        normalizeTeamMemberWriteFields(
          { name: "A", photoUrl: "https://evil.example/x.jpg" },
          "create",
        ),
      (e: unknown) =>
        e instanceof OwnerActivationError &&
        e.code === "PHOTO_URL_NOT_WRITABLE",
    );
    const created = normalizeTeamMemberWriteFields(
      { name: " Ali ", designation: " Broker " },
      "create",
    );
    assert.equal(created.name, "Ali");
    assert.equal(created.designation, "Broker");
    console.log("[3] arbitrary photoUrl rejected on write... PASS");
  }

  {
    const ws = "ws_team_a";
    const mid = "mem_1";
    const incomplete = validateTeamMemberForPublication({
      id: mid,
      workspaceId: ws,
      name: "Ali",
      designation: "Broker",
      photoUrl: null,
    });
    assert.equal(incomplete.ok, false);
    if (!incomplete.ok) {
      assert.equal(incomplete.code, "TEAM_MEMBER_INCOMPLETE");
    }

    const badUrl = validateTeamMemberForPublication({
      id: mid,
      workspaceId: ws,
      name: "Ali",
      designation: "Broker",
      photoUrl: "https://cdn.example/random.jpg",
    });
    assert.equal(badUrl.ok, false);
    if (!badUrl.ok) {
      assert.equal(badUrl.code, "TEAM_MEMBER_PHOTO_NOT_CANONICAL");
    }

    const goodKey = `workspaces/${ws}/team-members/${mid}/abc123.jpg`;
    assert.equal(isAcceptedTeamMemberPhotoUrl(goodKey, ws, mid), true);
    assert.equal(
      isAcceptedTeamMemberPhotoUrl(
        `https://branding-assets.houzzatpro.com/${goodKey}`,
        ws,
        mid,
      ),
      true,
    );
    assert.equal(
      isAcceptedTeamMemberPhotoUrl(
        `workspaces/ws_other/team-members/${mid}/abc123.jpg`,
        ws,
        mid,
      ),
      false,
    );

    const publishable = validateTeamMemberForPublication({
      id: mid,
      workspaceId: ws,
      name: "Ali",
      designation: "Broker",
      photoUrl: goodKey,
    });
    assert.equal(publishable.ok, true);
    console.log("[4] publication validator + photo gate... PASS");
  }

  {
    const manage = read("src/lib/tenancy/team-roster/manage.ts");
    assert.ok(manage.includes("LEADER_NOT_VISIBLE"));
    assert.ok(manage.includes("assertTeamMemberPublishable"));
    assert.ok(manage.includes("leaderMemberId: null"));
    assert.ok(manage.includes("isVisible: false"));
    assert.ok(manage.includes("DUPLICATE_ORDER_IDS"));
    assert.ok(manage.includes("findFirst"));
    assert.ok(manage.includes('where: { id: memberId, workspaceId }'));
    console.log("[5] leader / hide / delete / reorder contracts... PASS");
  }

  {
    const resolve = read(
      "src/lib/tenancy/templates/resolve-team-signature-view.ts",
    );
    assert.ok(resolve.includes("brand.teamRoster") || resolve.includes("teamRoster"));
    assert.ok(
      read("src/lib/tenancy/resolve-marketing-tenancy.ts").includes(
        "resolvePublicTeamRosterForWorkspace",
      ),
    );
    assert.ok(
      read("src/lib/tenancy/team-roster/public.ts").includes("isVisible: true"),
    );
    const home = read(
      "src/components/templates/team-signature/TeamSignatureHome.tsx",
    );
    assert.ok(home.includes("data-ts-homepage"));
    assert.ok(
      !read(
        "src/components/templates/agent-signature/AgentSignatureHome.tsx",
      ).includes("team-roster"),
    );
    console.log("[6] public Team Signature roster wired (E.7)... PASS");
  }

  {
    const manage = read("src/lib/tenancy/team-roster/manage.ts");
    assert.ok(!manage.includes("db.workspaceMember"));
    assert.ok(!manage.includes("WorkspaceSeatQuota"));
    assert.ok(!manage.includes("includedSeats"));
    console.log("[7] seat/account separation... PASS");
  }

  console.log("\nSTAGE 6.11E.4 selftest passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
