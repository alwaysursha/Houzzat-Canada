/**
 * Stage 6.11E.7 — public Team roster wiring selftest.
 * Run: pnpm stage-6.11e7-public-team-roster:selftest
 * No production mutation / deploy / selectable flip / MLS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTemplate,
  listSelectableTemplates,
  TEAM_SIGNATURE_TEMPLATE_ID,
  resolveTeamSignatureView,
} from "@/lib/tenancy/templates";
import { EMPTY_PUBLIC_PROFESSIONAL_IDENTITY } from "@/lib/tenancy/professional-identity";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { loadPublicTeamRosterPresentation } from "@/lib/tenancy/team-roster/public";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

type MemberRow = {
  id: string;
  workspaceId: string;
  name: string | null;
  designation: string | null;
  photoUrl: string | null;
  bio: string | null;
  cellPhone: string | null;
  email: string | null;
  sortOrder: number;
  isVisible: boolean;
};

function makeDb(opts: {
  workspaceId: string;
  profile: {
    aboutText: string | null;
    serviceAreas: string[] | null;
    leaderMemberId: string | null;
  } | null;
  members: MemberRow[];
}) {
  return {
    workspaceTeamProfile: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) => {
        if (where.workspaceId !== opts.workspaceId) return null;
        return opts.profile;
      },
    },
    workspaceTeamMember: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: { workspaceId: string; isVisible: boolean };
        orderBy: Array<Record<string, "asc" | "desc">>;
      }) => {
        assert.equal(where.isVisible, true);
        let rows = opts.members.filter(
          (m) => m.workspaceId === where.workspaceId && m.isVisible,
        );
        // Apply sortOrder then id
        rows = [...rows].sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        void orderBy;
        return rows.map((m) => ({
          id: m.id,
          name: m.name,
          designation: m.designation,
          photoUrl: m.photoUrl,
          bio: m.bio,
          cellPhone: m.cellPhone,
          email: m.email,
          sortOrder: m.sortOrder,
        }));
      },
    },
  };
}

function baseBrand(
  overrides: Partial<MarketingPresentationBrand> = {},
): MarketingPresentationBrand {
  return {
    displayName: "Team Co",
    tagline: "Tag",
    workspaceSlug: "team-co",
    workspaceId: "ws_team",
    poweredByHouzzatPro: true,
    isHouzzatWorkspace: false,
    logoUrl: null,
    brokerageLogoUrl: null,
    faviconUrl: null,
    ogImageUrl: null,
    colors: {
      primary: "#0F6B4C",
      secondary: "#0A4D38",
      accent: "#1F7A8C",
      surface: "#FFFFFF",
      ink: "#14201C",
    },
    contact: { email: null, phone: null },
    footerLegalText: null,
    seoDescription: "seo",
    version: 1,
    publicOrigin: "https://team-co.houzzatpro.com",
    canonicalOrigin: "https://team-co.houzzatpro.com",
    templateId: TEAM_SIGNATURE_TEMPLATE_ID,
    agent: null,
    professionalIdentity: EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
    teamRoster: null,
    templatePreview: null,
    ...overrides,
  };
}

async function main() {
  console.log("\n=== STAGE 6.11E.7 — PUBLIC TEAM ROSTER WIRING ===\n");

  const publicSrc = read("src/lib/tenancy/team-roster/public.ts");
  const resolveSrc = read(
    "src/lib/tenancy/templates/resolve-team-signature-view.ts",
  );
  const marketingSrc = read("src/lib/tenancy/resolve-marketing-tenancy.ts");
  const meetSrc = read(
    "src/components/templates/team-signature/TeamSignatureMeetSection.tsx",
  );

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, true);
    assert.equal(listSelectableTemplates().length, 3);
    console.log("[0] selectable=true... PASS");
  }

  {
    const WS = "ws_a";
    const other = "ws_b";
    const db = makeDb({
      workspaceId: WS,
      profile: {
        aboutText: "  About us  ",
        serviceAreas: ["Toronto", "Vaughan"],
        leaderMemberId: "m_leader",
      },
      members: [
        {
          id: "m_hidden",
          workspaceId: WS,
          name: "Hidden",
          designation: "Agent",
          photoUrl: null,
          bio: null,
          cellPhone: null,
          email: null,
          sortOrder: 0,
          isVisible: false,
        },
        {
          id: "m_second",
          workspaceId: WS,
          name: "Second",
          designation: "Salesperson",
          photoUrl: null,
          bio: null,
          cellPhone: null,
          email: null,
          sortOrder: 20,
          isVisible: true,
        },
        {
          id: "m_leader",
          workspaceId: WS,
          name: "Leader",
          designation: "Broker",
          photoUrl: "/photo.jpg",
          bio: "Hello",
          cellPhone: "416",
          email: "l@ex.com",
          sortOrder: 10,
          isVisible: true,
        },
        {
          id: "m_other_ws",
          workspaceId: other,
          name: "Other WS",
          designation: "Broker",
          photoUrl: null,
          bio: null,
          cellPhone: null,
          email: null,
          sortOrder: 0,
          isVisible: true,
        },
      ],
    });

    const roster = await loadPublicTeamRosterPresentation(WS, db as never);
    assert.equal(roster.aboutText, "About us");
    assert.deepEqual(roster.serviceAreas, ["Toronto", "Vaughan"]);
    assert.equal(roster.leaderMemberId, "m_leader");
    assert.equal(roster.members.length, 2);
    assert.deepEqual(
      roster.members.map((m) => m.id),
      ["m_leader", "m_second"],
    );
    assert.equal(roster.members[0]?.isLeader, true);
    assert.equal(roster.members[1]?.isLeader, false);
    assert.ok(!roster.members.some((m) => m.id === "m_hidden"));
    assert.ok(!roster.members.some((m) => m.id === "m_other_ws"));
    console.log("[1] visibility / order / leader / workspace isolation... PASS");
  }

  {
    const empty = await loadPublicTeamRosterPresentation(
      "ws_empty",
      makeDb({
        workspaceId: "ws_empty",
        profile: null,
        members: [],
      }) as never,
    );
    assert.equal(empty.aboutText, null);
    assert.deepEqual(empty.serviceAreas, []);
    assert.equal(empty.leaderMemberId, null);
    assert.deepEqual(empty.members, []);

    const invisibleLeader = await loadPublicTeamRosterPresentation(
      "ws_x",
      makeDb({
        workspaceId: "ws_x",
        profile: {
          aboutText: null,
          serviceAreas: [],
          leaderMemberId: "hidden_leader",
        },
        members: [
          {
            id: "hidden_leader",
            workspaceId: "ws_x",
            name: "Hidden Lead",
            designation: "Broker",
            photoUrl: null,
            bio: null,
            cellPhone: null,
            email: null,
            sortOrder: 0,
            isVisible: false,
          },
          {
            id: "vis",
            workspaceId: "ws_x",
            name: "Visible",
            designation: "Agent",
            photoUrl: null,
            bio: null,
            cellPhone: null,
            email: null,
            sortOrder: 10,
            isVisible: true,
          },
        ],
      }) as never,
    );
    assert.equal(invisibleLeader.leaderMemberId, null);
    assert.equal(invisibleLeader.members.length, 1);
    assert.equal(invisibleLeader.members[0]?.isLeader, false);
    console.log("[2] missing profile + invisible leader safe... PASS");
  }

  {
    const emptyView = resolveTeamSignatureView(baseBrand());
    assert.equal(emptyView.members, null);

    const withMembers = resolveTeamSignatureView(
      baseBrand({
        teamRoster: {
          aboutText: "About",
          serviceAreas: ["Oakville"],
          leaderMemberId: "a",
          members: [
            {
              id: "a",
              name: "Ann",
              designation: "Broker",
              photoUrl: null,
              bio: null,
              cellPhone: null,
              email: null,
              isLeader: true,
              sortOrder: 0,
            },
          ],
        },
      }),
    );
    assert.equal(withMembers.members?.length, 1);
    assert.equal(withMembers.members?.[0]?.isLeader, true);
    assert.equal(withMembers.serviceArea, "Oakville");
    assert.equal(withMembers.testimonials, null);
    console.log("[3] view: null when empty; members when published... PASS");
  }

  {
    assert.ok(marketingSrc.includes("resolvePublicTeamRosterForWorkspace"));
    assert.ok(marketingSrc.includes("isTeamSignatureTemplateId"));
    assert.ok(marketingSrc.includes("Promise.all"));
    assert.ok(resolveSrc.includes("brand.teamRoster"));
    assert.ok(meetSrc.includes("view.members"));
    assert.ok(publicSrc.includes("isVisible: true"));
    assert.ok(publicSrc.includes('orderBy: [{ sortOrder: "asc" }, { id: "asc" }]'));
    assert.ok(!publicSrc.includes("WorkspaceMember"));
    assert.ok(!publicSrc.includes("DataConnection"));
    assert.ok(!publicSrc.includes("ListingSource"));
    assert.ok(!publicSrc.includes("TYPESENSE"));
    assert.ok(!/\$transaction\s*\(/.test(publicSrc));
    assert.ok(!/\.updateMany\s*\(/.test(publicSrc));
    assert.ok(!marketingSrc.includes("FeaturedProperties"));
    console.log("[4] architecture / Neon-safe / no MLS coupling... PASS");
  }

  console.log("\nstage-6.11e7-public-team-roster:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
