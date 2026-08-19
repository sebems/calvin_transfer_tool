const CACHE_TTL = 24 * 60 * 60 * 1000; // 24hr cache
const TOKEN = "TEST";

const CART_STORAGE_KEY = "calvinTransferCart";

const institutionCache = { data: null, timestamp: 0 };
const courseCache = new Map();
let selectedCourses = new Map();
let totalCredits = 0;

const COURSE_API_URL =
  "https://apim.workato.com/calvinuniversity/int449-transfer-credit-rules-api-v1/wd-api-int449-courses";
const INSTITUTION_API_URL =
  "https://apim.workato.com/calvinuniversity/int449-transfer-credit-rules-api-v1/wd-api-int449-institutions";

// --- State Management ---
function saveCartState() {
  localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify(Array.from(selectedCourses.entries())),
  );
}

function loadCartState() {
  const savedCart = localStorage.getItem(CART_STORAGE_KEY);
  if (savedCart) {
    try {
      const parsed = JSON.parse(savedCart);
      selectedCourses = new Map(parsed);
    } catch (e) {
      console.error("Failed to load saved cart data.", e);
    }
  }
  renderCart();
}

// --- Utilities ---
function debounce(func, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

function getPrimaryInternalCourseId(course, index) {
  return course.internal_courses?.[0]?.course_id || `course-${index}`;
}

function getCourseLabel(courses = []) {
  return courses
    .map(
      (course) =>
        `${course.course_id || "Unknown"} - ${course.course_title || "Untitled"}`,
    )
    .join(", ");
}

// --- UI Rendering ---
function showCourseMessage(message, type = "secondary") {
  const courseList = document.getElementById("coursesListAccordion");
  if (!courseList) return;
  courseList.innerHTML = `<div class="alert alert-${type}" role="alert">${message}</div>`;
}

function showLoadingCourses() {
  const courseList = document.getElementById("coursesListAccordion");
  if (!courseList) return;

  let skeletons = "";
  for (let i = 0; i < 2; i++) {
    skeletons += `
        <div class="accordion-item mb-3 shadow-sm border-0 rounded p-3">
            <div class="row g-3">
                <div class="col-auto pt-1">
                    <div class="skeleton" style="width: 20px; height: 20px;"></div>
                </div>
                <div class="col">
                    <div class="d-flex justify-content-between mb-2">
                        <div class="skeleton skeleton-text" style="width: 25%;"></div>
                    </div>
                    <div class="skeleton skeleton-text skeleton-title mb-3"></div>
                    <hr>
                    <div class="d-flex justify-content-between mb-2">
                        <div class="skeleton skeleton-text" style="width: 25%;"></div>
                        <div class="skeleton skeleton-text" style="width: 15%;"></div>
                    </div>
                    <div class="skeleton skeleton-text skeleton-body"></div>
                </div>
            </div>
        </div>`;
  }
  courseList.innerHTML = skeletons;
}

function renderCart() {
  const cartItems = document.getElementById("cartItems");
  const cartCount = document.getElementById("cartCount");
  const totalCreditCount = document.getElementById("totalCreditCount");

  if (!cartItems || !cartCount) return;

  cartItems.innerHTML = "";
  cartCount.textContent = selectedCourses.size.toString();
  totalCredits = 0;

  if (selectedCourses.size === 0) {
    cartItems.innerHTML = `<li class="list-group-item text-muted text-center py-4 border-0">No courses selected.</li>`;
    if (totalCreditCount)
      totalCreditCount.innerHTML = `<h5 class="mb-0 text-muted">Total Credits: 0</h5>`;
    return;
  }

  selectedCourses.forEach((course, courseId) => {
    totalCredits += Number(course.credit_hours || 0);

    const item = document.createElement("li");
    item.className =
      "list-group-item px-0 d-flex justify-content-between align-items-start gap-3 border-bottom";

    const courseInfo = document.createElement("div");
    courseInfo.className = "me-auto";
    courseInfo.innerHTML = `
            <div class="fw-bold text-calvin small">${course.institutionName || "Unknown Institution"}</div>
            <div class="fw-bold">${getCourseLabel(course.internal_courses || [])}</div>
            <div class="small text-muted">From: ${getCourseLabel(course.external_courses || [])}</div>
        `;

    const removeButton = document.createElement("button");
    removeButton.className =
      "btn btn-sm btn-outline-danger remove-cart-item border-0";
    removeButton.dataset.courseId = courseId;
    removeButton.innerHTML = `<i class="bi bi-trash" style="pointer-events: none;"></i>`;

    item.appendChild(courseInfo);
    item.appendChild(removeButton);
    cartItems.appendChild(item);
  });

  if (totalCreditCount) {
    totalCreditCount.innerHTML = `<h5 class="mb-0">Total Credits: <span class="badge bg-secondary">${totalCredits}</span></h5>`;
  }
}

function addCourseToCart(course, courseId) {
  const institutionSelect = document.getElementById("institution-search");
  const institutionName =
    institutionSelect && institutionSelect.selectedIndex >= 0
      ? institutionSelect.options[institutionSelect.selectedIndex].text
      : "Unknown Institution";

  selectedCourses.set(courseId, { ...course, institutionName });
  saveCartState();
  renderCart();
}

function removeCourseFromCart(courseId) {
  selectedCourses.delete(courseId);
  const checkbox = document.getElementById(courseId);
  if (checkbox) checkbox.checked = false;
  saveCartState();
  renderCart();
}

async function getInstitutions(token) {
  const CACHE_KEY = "calvin_institution_cache";
  const now = Date.now();

  // 1. Try reading from localStorage
  const cachedRaw = localStorage.getItem(CACHE_KEY);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      // Use your existing isFresh() helper function
      if (cached.data && isFresh(cached.timestamp)) {
        console.log("Using localStorage cached institutions");
        return cached.data;
      }
    } catch (e) {
      console.warn("Failed to parse cached institutions", e);
    }
  }

  // 2. Fetch fresh data if missing or expired
  try {
    const response = await fetch(INSTITUTION_API_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "API-Token": token,
      },
    });

    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    const result = await response.json();
    const institutions = result.Institutions || [];

    // 3. Save to localStorage
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        data: institutions,
        timestamp: now,
      }),
    );

    return institutions;
  } catch (error) {
    console.error(error.message);
    throw error;
  }
}

async function getCourses(token, institutionId) {
  const cachedCourses = courseCache.get(institutionId);
  const now = Date.now();

  if (cachedCourses && now - cachedCourses.timestamp < CACHE_TTL) {
    return cachedCourses.data;
  }

  const response = await fetch(
    `${COURSE_API_URL}?InstitutionID=${encodeURIComponent(institutionId)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "API-Token": token,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Response status: ${response.status}`);
  }

  const result = await response.json();
  const rules = result.rules || [];

  courseCache.set(institutionId, {
    data: rules,
    timestamp: now,
  });

  return rules;
}

async function loadInstitutions(token) {
  const institutions = await getInstitutions(token);
  const select = document.getElementById("institution-search");

  if (!select) return;

  institutions.forEach((institution) => {
    const option = document.createElement("option");

    option.value = institution.ReferenceID;
    option.textContent = institution.InstitutionName;

    select.appendChild(option);
  });
}

// Helper for UI generation
function createCourseBlock(
  title,
  courses = [],
  credits,
  showCredits = true,
  actionElement = null,
) {
  const wrapper = document.createElement("div");
  wrapper.className = "mb-2";

  const titleRow = document.createElement("div");
  titleRow.className = "d-flex justify-content-between align-items-center mb-2";

  const titleElement = document.createElement("div");
  titleElement.className =
    "text-muted text-uppercase small fw-bold tracking-wide";
  titleElement.textContent = title;

  titleRow.appendChild(titleElement);
  if (actionElement) titleRow.appendChild(actionElement);

  wrapper.appendChild(titleRow);

  if (!courses.length) {
    wrapper.innerHTML += `<p class="mb-0 text-muted small">No courses returned.</p>`;
    return wrapper;
  }

  courses.forEach((course) => {
    const container = document.createElement("div");
    container.innerHTML = `<h5 class="mb-1">
            ${course.course_id || "Unknown"} - ${course.course_title || "Untitled"} 
            ${showCredits ? `<span class="badge bg-warning text-dark ms-2 align-middle">${credits} Credits</span>` : ""}
        </h5>`;
    wrapper.appendChild(container);
  });

  return wrapper;
}

// Generate the course list view
async function loadCourses(token, institutionId) {
  const courses = await getCourses(token, institutionId);
  const courseList = document.getElementById("coursesListAccordion");
  if (!courseList) return;

  courseList.innerHTML = "";
  if (!courses.length) {
    showCourseMessage(
      "No transfer courses were returned for this institution.",
      "warning",
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  courses.forEach((course, index) => {
    const courseId = getPrimaryInternalCourseId(course, index);
    const collapseId = `course-description-${index}`;

    const accordionItem = document.createElement("div");
    accordionItem.className = "accordion-item mb-3 shadow-sm border-0 rounded";

    const body = document.createElement("div");
    body.className = "accordion-body bg-white rounded";

    const row = document.createElement("div");
    row.className = "row align-items-start g-3";

    const checkCol = document.createElement("div");
    checkCol.className = "col-auto pt-1";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "form-check-input mt-2 border-secondary";
    checkbox.style.transform = "scale(1.2)";
    checkbox.id = courseId;

    // Ensure state carries over when redrawing
    checkbox.checked = selectedCourses.has(courseId);
    checkbox.addEventListener("change", (e) => {
      e.target.checked
        ? addCourseToCart(course, courseId)
        : removeCourseFromCart(courseId);
    });
    checkCol.appendChild(checkbox);

    const contentCol = document.createElement("div");
    contentCol.className = "col";

    const btn = document.createElement("button");
    btn.className = "btn btn-sm btn-light border text-secondary";
    btn.type = "button";
    btn.setAttribute("data-bs-toggle", "collapse");
    btn.setAttribute("data-bs-target", `#${collapseId}`);
    btn.innerHTML = `<i class="bi bi-info-circle me-1"></i> Description`;

    contentCol.appendChild(
      createCourseBlock(
        "External Course",
        course.external_courses || [],
        course.credit_hours,
        false,
      ),
    );
    contentCol.appendChild(document.createElement("hr"));
    contentCol.appendChild(
      createCourseBlock(
        "Calvin Course",
        course.internal_courses || [],
        course.credit_hours,
        true,
        btn,
      ),
    );

    row.appendChild(checkCol);
    row.appendChild(contentCol);
    body.appendChild(row);

    const collapseDiv = document.createElement("div");
    collapseDiv.className = "collapse mt-3";
    collapseDiv.id = collapseId;

    const descriptionCard = document.createElement("div");
    descriptionCard.className =
      "card card-body bg-light border-0 small text-secondary";

    const internalCourses = course.internal_courses || [];
    if (!internalCourses.length) {
      descriptionCard.innerHTML = "<em>No description available.</em>";
    } else {
      internalCourses.forEach((internalCourse, idx) => {
        if (idx > 0) descriptionCard.appendChild(document.createElement("hr"));
        const descBlock = document.createElement("div");
        descBlock.innerHTML = `
                    <div class="fw-bold text-dark mb-1">${internalCourse.course_id || "Unknown"}:</div>
                    <div>${internalCourse.course_description || "<em>No description available.</em>"}</div>
                    <div>${internalCourse.is_core ? `<i class="bi bi-check-circle-fill"></i> Core Course` : ""}</div>
                `;
        descriptionCard.appendChild(descBlock);
      });
    }

    collapseDiv.appendChild(descriptionCard);
    body.appendChild(collapseDiv);
    accordionItem.appendChild(body);
    fragment.appendChild(accordionItem);
  });

  courseList.appendChild(fragment);
}

loadInstitutions(TOKEN).catch((error) => {
  console.error("Error loading institutions:", error);
  showCourseMessage(
    "Institutions could not be loaded. Check the API token and try again.",
    "danger",
  );
});

loadCartState(); // Load any saved items from local storage immediately

const institutionSelect = document.getElementById("institution-search");
const courseSearch = document.getElementById("course-search");

if (institutionSelect) {
  institutionSelect.addEventListener("change", async (event) => {
    const institutionId = event.target.value;

    if (!institutionId) {
      showCourseMessage("Select an institution to view transfer courses.");
      courseSearch.classList.add("d-none");
      return;
    }

    courseSearch.classList.remove("d-none");
    courseSearch.value = "";

    try {
      showLoadingCourses();
      await loadCourses(TOKEN, institutionId);
    } catch (error) {
      showCourseMessage(
        "Courses could not be loaded. Check the selected institution and API response.",
        "danger",
      );
    }
  });
}

// Search Feature with Debounce
if (courseSearch) {
  courseSearch.addEventListener(
    "input",
    debounce((e) => {
      const searchTerm = e.target.value.toLowerCase();
      const courseItems = document.querySelectorAll(
        "#coursesListAccordion .accordion-item",
      );

      courseItems.forEach((item) => {
        const textContent = item.textContent.toLowerCase();
        if (textContent.includes(searchTerm)) {
          item.classList.remove("d-none");
        } else {
          item.classList.add("d-none");
        }
      });
    }, 250),
  ); // Wait 250ms after user stops typing to filter the UI
}

document.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-cart-item");
  if (!removeButton) return;
  removeCourseFromCart(removeButton.dataset.courseId);
});

document.getElementById("cmd")?.addEventListener("click", function () {
  if (selectedCourses.size === 0) {
    alert("Please select at least one course before exporting.");
    return;
  }

  // 1. Create an off-screen container for clean printing
  const printContainer = document.createElement("div");
  printContainer.style.padding = "20px";
  printContainer.style.fontFamily = "Arial, sans-serif";

  // 2. Add header branding
  let htmlContent = `
    <div style="border-bottom: 2px solid #8b0000; padding-bottom: 10px; margin-bottom: 20px;">
      <h2 style="color: #8b0000; margin: 0;">Calvin University</h2>
      <h4 style="margin: 5px 0 0 0; color: #555;">Transfer Credit Evaluation Summary</h4>
    </div>
    <ul style="list-style: none; padding: 0;">
  `;

  // 3. Render items cleanly without interactive UI elements
  selectedCourses.forEach((course) => {
    htmlContent += `
      <li style="border-bottom: 1px solid #ddd; padding: 10px 0; page-break-inside: avoid;">
        <div style="font-size: 11px; font-weight: bold; color: #8b0000;">
          ${course.institutionName || "Unknown Institution"}
        </div>
        <div style="font-weight: bold; font-size: 14px;">
          Calvin: ${getCourseLabel(course.internal_courses || [])}
        </div>
        <div style="font-size: 12px; color: #666;">
          Transferring From: ${getCourseLabel(course.external_courses || [])}
        </div>
      </li>
    `;
  });

  // 4. Add Total Credits at the bottom
  htmlContent += `
    </ul>
    <div style="margin-top: 20px; font-size: 16px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px;">
      Total Transfer Credits: ${totalCredits}
    </div>
  `;

  printContainer.innerHTML = htmlContent;

  // 5. PDF generation options
  const options = {
    margin: [0.5, 0.5, 0.5, 0.5],
    filename: "Calvin-Transfer-Equivalencies.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, scrollY: 0 },
    jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] }, // Prevents awkward page breaks in items
  };

  // Generate PDF from the clean off-screen element
  html2pdf().set(options).from(printContainer).save();
});
