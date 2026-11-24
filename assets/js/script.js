'use strict';



// element toggle function
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); }



// sidebar variables
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

// sidebar toggle functionality for mobile
sidebarBtn.addEventListener("click", function () {
  elementToggleFunc(sidebar);
  sidebarBtn.setAttribute("aria-expanded", sidebar.classList.contains("active") ? "true" : "false");
});



// testimonials variables
const testimonialsItem = document.querySelectorAll("[data-testimonials-item]");
const modalContainer = document.querySelector("[data-modal-container]");
const modalCloseBtn = document.querySelector("[data-modal-close-btn]");
const overlay = document.querySelector("[data-overlay]");

// modal variable
const modalImg = document.querySelector("[data-modal-img]");
const modalTitle = document.querySelector("[data-modal-title]");
const modalText = document.querySelector("[data-modal-text]");
const modalRole = document.querySelector("[data-modal-role]");

// modal toggle function
let lastFocus = null;
const testimonialsModalFunc = function () {
  modalContainer.classList.toggle("active");
  overlay.classList.toggle("active");
  if (modalContainer.classList.contains("active")) {
    lastFocus = document.activeElement;
    // Wait for the dialog's fade-in to make it visible before moving focus into it.
    setTimeout(function () { modalCloseBtn.focus(); }, 60);
  } else if (lastFocus) {
    lastFocus.focus();
  }
}

// add click event to all modal items
for (let i = 0; i < testimonialsItem.length; i++) {

  testimonialsItem[i].setAttribute("role", "button");
  testimonialsItem[i].setAttribute("tabindex", "0");
  testimonialsItem[i].addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.click(); }
  });

  testimonialsItem[i].addEventListener("click", function () {

    modalImg.src = this.querySelector("[data-testimonials-avatar]").src;
    modalImg.alt = this.querySelector("[data-testimonials-avatar]").alt;
    modalTitle.innerHTML = this.querySelector("[data-testimonials-title]").innerHTML;
    modalRole.innerHTML = this.querySelector("[data-testimonials-role]").innerHTML;
    modalText.innerHTML = this.querySelector("[data-testimonials-text]").innerHTML;

    testimonialsModalFunc();

  });

}

// add click event to modal close button
modalCloseBtn.addEventListener("click", testimonialsModalFunc);
overlay.addEventListener("click", testimonialsModalFunc);
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && modalContainer.classList.contains("active")) testimonialsModalFunc();
});



// custom select variables
const select = document.querySelector("[data-select]");
const selectItems = document.querySelectorAll("[data-select-item]");
const selectValue = document.querySelector("[data-selecct-value]");
const filterBtn = document.querySelectorAll("[data-filter-btn]");

select.addEventListener("click", function () { elementToggleFunc(this); });

// add event in all select items
for (let i = 0; i < selectItems.length; i++) {
  selectItems[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    elementToggleFunc(select);
    filterFunc(selectedValue);

  });
}

// filter variables
const filterItems = document.querySelectorAll("[data-filter-item]");

const filterFunc = function (selectedValue) {

  for (let i = 0; i < filterItems.length; i++) {
    var categories = filterItems[i].dataset.category;
    categories = categories.split(";");
    for (let j = 0; j < categories.length; j++) {
      if (selectedValue === "all") {
        filterItems[i].classList.add("active");
      } else if (selectedValue === categories[j]) {
        filterItems[i].classList.add("active");
        break;
      } else {
        filterItems[i].classList.remove("active");
      }
    }

  }

}

// add event in all filter button items for large screen
let lastClickedBtn = filterBtn[0];

for (let i = 0; i < filterBtn.length; i++) {

  filterBtn[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    filterFunc(selectedValue);

    lastClickedBtn.classList.remove("active");
    this.classList.add("active");
    lastClickedBtn = this;

  });

}



// contact form variables
const form = document.querySelector("[data-form]");
const formInputs = document.querySelectorAll("[data-form-input]");
const formBtn = document.querySelector("[data-form-btn]");

// add event to all form input field
for (let i = 0; i < formInputs.length; i++) {
  formInputs[i].addEventListener("input", function () {

    // check form validation
    if (form.checkValidity()) {
      formBtn.removeAttribute("disabled");
    } else {
      formBtn.setAttribute("disabled", "");
    }

  });
}



// page navigation variables
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

// Show one section. Each section also has its own address (e.g. /#resume) so it can be shared and bookmarked.
function openPage(page, fromHistory) {
  let found = false;
  for (let i = 0; i < pages.length; i++) {
    const match = page === pages[i].dataset.page;
    pages[i].classList.toggle("active", match);
    navigationLinks[i].classList.toggle("active", match);
    if (match) { navigationLinks[i].setAttribute("aria-current", "page"); found = true; }
    else navigationLinks[i].removeAttribute("aria-current");
  }
  if (!found) return openPage("about", fromHistory);
  if (!fromHistory) {
    const hash = page === "about" ? location.pathname : "#" + page;
    if ((location.hash || "#about") !== "#" + page) history.pushState(null, "", hash);
  }
  window.scrollTo(0, 0);
}

for (let i = 0; i < navigationLinks.length; i++) {
  navigationLinks[i].addEventListener("click", function () {
    openPage(this.innerHTML.toLowerCase());
  });
}

// Home cards: open with Enter / Space as well as a click.
document.querySelectorAll("[data-open]").forEach(function (card) {
  card.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openPage(card.dataset.open); }
  });
});

function pageFromHash() { return (location.hash || "#about").slice(1).toLowerCase(); }
window.addEventListener("popstate", function () { openPage(pageFromHash(), true); });
if (location.hash) openPage(pageFromHash(), true);
