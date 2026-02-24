import {
  joback_group_contribution_category,
  joback_group_contribution_ids,
  joback_group_contribution_info,
  joback_group_contribution_names,
} from "../src/index";

console.log("=== Joback group contribution info ===");
const groupInfo = joback_group_contribution_info();
console.log(groupInfo);

console.log("\n=== Joback group contribution names ===");
const groupNames = joback_group_contribution_names();
console.log(groupNames);

console.log("\n=== Joback group contribution ids ===");
const groupIds = joback_group_contribution_ids();
console.log(groupIds);

console.log("\n=== Joback group contribution categories ===");
const groupCategory = joback_group_contribution_category();
console.log(groupCategory);
console.log(`Total categories: ${Object.keys(groupCategory).length}`);
for (const [cat, items] of Object.entries(groupCategory)) {
  console.log(`Category: ${cat}, Total items: ${items.length}`);
}

