import { describe, expect, it } from "vitest";
import { layoutTreeNodes, SPOUSE_SIDE_OFFSET } from "./treeLayout";
import type { TreeNode } from "./types";

function minimalNode(
  id: string,
  name: string,
  generation: number,
  relation: string,
): TreeNode {
  return {
    id,
    name,
    relation,
    gender: "male",
    branch: "main",
    gotra: "",
    moolNiwas: "",
    ownerId: id,
    createdBy: id,
    createdAt: 1,
    verificationTier: "self-declared",
    borderStyle: "solid",
    status: "active",
    generation,
    visibility: "public",
  };
}

describe("vertical growth (Upright: ancestors toward bottom, progeny toward top)", () => {
  it("places Great Grandfather (gen -3) lower on canvas than Grandson (gen +2); larger SVG y = closer to bottom", () => {
    const ggf = minimalNode("ggf", "Great Grandfather", -3, "member");
    const self = minimalNode("self", "Anchor", 0, "self");
    const grandson = minimalNode("gs", "Grandson", 2, "Son");

    const { positionedNodes } = layoutTreeNodes([ggf, self, grandson], [], []);

    const y = (id: string) => positionedNodes.find((n) => n.id === id)!.y;

    expect(y("ggf")).toBeGreaterThan(y("gs"));
    expect(y("ggf")).toBeGreaterThan(y("self"));
    expect(y("self")).toBeGreaterThan(y("gs"));
  });

  it("treats wife/husband edges as spouse pairs with uniform spacing", () => {
    const male = minimalNode("m1", "Anuj", 0, "self");
    const female = {
      ...minimalNode("f1", "Amit spouse", 0, "Wife"),
      gender: "female" as const,
      createdAt: 2,
    };

    const { positionedNodes } = layoutTreeNodes(
      [male, female],
      [{ from: male.id, to: female.id, relation: "Wife" }],
      [],
    );

    const a = positionedNodes.find((n) => n.id === male.id)!;
    const b = positionedNodes.find((n) => n.id === female.id)!;
    expect(Math.abs(a.x - b.x)).toBe(SPOUSE_SIDE_OFFSET);
  });
});
