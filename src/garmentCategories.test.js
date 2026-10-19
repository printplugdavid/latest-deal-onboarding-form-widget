import { GARMENT_KINDS } from "./placements";
import { AGE_GROUPS, BOOKS_CATEGORY_BY_KIND, booksCategoryFor } from "./garmentCategories";
import styles from "./onlineOrder/styles.json";
import pulled from "./onlineOrder/productStyles.json";

const entries = Object.entries(styles).filter(([k]) => !k.startsWith("_"));

describe("D-43: every garment kind reports under one Books category", () => {
  test("each kind on the form has a category, and no category names a kind the form lacks", () => {
    expect(Object.keys(BOOKS_CATEGORY_BY_KIND).sort()).toEqual([...GARMENT_KINDS].sort());
  });
  test("age wins over kind; old kind names report like the new ones", () => {
    expect(booksCategoryFor("Polo")).toBe("Garment - Polos");
    expect(booksCategoryFor("Polo / Button-up")).toBe("Garment - Polos");
    expect(booksCategoryFor("Tee / Long Sleeve / Tank")).toBe("Garment - Tops");
    expect(booksCategoryFor("Beanie")).toBe("Garment - Hats");
    expect(booksCategoryFor("Tee / Long Sleeve / Tank / Button-up", "Infant-Toddler")).toBe("Garment - Infant/Toddler");
    expect(booksCategoryFor("Hoodie / Crew / Zip", "Youth")).toBe("Garment - Youth");
    expect(booksCategoryFor("Not a kind")).toBe("");
  });
});

describe("release check: the style catalogue (E-89 / E-92)", () => {
  test("every style has a name, the supplier as vendor (D-41), a form kind and an age group", () => {
    entries.forEach(([code, s]) => {
      expect([code, !!s.name]).toEqual([code, true]);
      expect([code, s.vendor]).toEqual([code, expect.stringMatching(/^(Sanmar|S&S Activewear)$/)]);
      expect([code, GARMENT_KINDS.includes(s.kind)]).toEqual([code, true]);
      expect([code, AGE_GROUPS.includes(s.age)]).toEqual([code, true]);
    });
  });
  test("nothing says Inventory any more (D-41: no store keeps stock)", () => {
    expect(entries.filter(([, s]) => /inventory/i.test(s.vendor))).toEqual([]);
  });
  test("every style the InkSoft product table names is in the catalogue", () => {
    const missing = [...new Set(Object.entries(pulled).filter(([k]) => !k.startsWith("_")).map(([, v]) => v))]
      .filter((code) => !styles[code]);
    expect(missing).toEqual([]);
  });
  test("a successor is a different style (D-42)", () => {
    entries.filter(([, s]) => s.successor).forEach(([code, s]) => expect(s.successor).not.toBe(code));
  });
});
