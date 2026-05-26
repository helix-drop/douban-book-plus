import { preferencesKey } from "./common.js";

const vendors = [
  "weread",
  "douban",
  "zlibrary",
  "anna"
];

let settings = undefined;

function toggle(event) {
  let vendor = vendorId(event.target.id);
  settings[vendor] = this.checked;
  chrome.storage.sync.set({ [preferencesKey]: settings });
}

function checkboxId(vendor) {
  return vendor + "-checkbox";
}

function vendorId(vendorCheckboxId) {
  return vendorCheckboxId.split("-")[0].trim();
}

chrome.storage.sync.get(preferencesKey, function (item) {
  settings = item[preferencesKey] ?? {};
  for (let vendor of vendors) {
    let checked = settings[vendor] ?? true;
    let element = document.getElementById(vendor);
    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = checkboxId(vendor);
    if (checked) {
      checkbox.setAttribute("checked", "");
    }
    checkbox.addEventListener("click", toggle);
    element.appendChild(checkbox);
    let emptyLabel = document.createElement("label");
    element.appendChild(emptyLabel);
  }
});
