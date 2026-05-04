"""
Production E2E checks for the deployed Tizahab Render app.

Run:
    python tests/test_render_user_journey.py
    python tests/test_render_user_journey.py --headless
    python tests/test_render_user_journey.py --url https://tizahab-web.onrender.com
    python tests/test_render_user_journey.py --slow

Dependencies:
    pip install selenium webdriver-manager requests
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from dataclasses import dataclass, asdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse, parse_qs


MISSING_DEPS: list[str] = []

try:
    import requests
except ImportError:
    MISSING_DEPS.append("requests")

try:
    from selenium import webdriver
    from selenium.common.exceptions import (
        ElementClickInterceptedException,
        JavascriptException,
        NoSuchElementException,
        TimeoutException,
        WebDriverException,
    )
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.remote.webelement import WebElement
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
except ImportError:
    MISSING_DEPS.append("selenium")

try:
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    MISSING_DEPS.append("webdriver-manager")


DEFAULT_URL = "https://tizahab-web.onrender.com"
ARTIFACT_DIR = Path(__file__).resolve().parent / "e2e_artifacts"
JSON_REPORT = ARTIFACT_DIR / "render_e2e_report.json"
TEXT_REPORT = ARTIFACT_DIR / "render_e2e_report.txt"


@dataclass
class CheckResult:
    name: str
    status: str
    detail: str
    url: str = ""
    screenshot: str = ""
    console_errors: list[str] | None = None


class RenderJourneyTester:
    def __init__(self, base_url: str, headless: bool = False, slow: bool = False) -> None:
        self.base_url = base_url.rstrip("/")
        self.headless = headless
        self.slow = slow
        self.results: list[CheckResult] = []
        self.session = requests.Session()
        self.driver: webdriver.Chrome | None = None
        self.wait: WebDriverWait | None = None
        self.test_email = f"tizahab_e2e_{int(time.time())}@example.com"
        self.test_password = "TizahabE2E123!"
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    def build_driver(self) -> bool:
        opts = Options()
        if self.headless:
            opts.add_argument("--headless=new")
        opts.add_argument("--window-size=1440,1000")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--disable-extensions")
        opts.add_argument("--log-level=3")
        opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})

        try:
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=opts)
            self.wait = WebDriverWait(self.driver, 15)
            return True
        except Exception as exc:
            self.fail(
                "browser startup",
                "Chrome/WebDriver could not start. Exact blocker: "
                f"{type(exc).__name__}: {exc}",
            )
            return False

    def close(self) -> None:
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass

    def full_url(self, path: str) -> str:
        return urljoin(self.base_url + "/", path.lstrip("/"))

    def add_result(
        self,
        status: str,
        name: str,
        detail: str,
        url: str = "",
        screenshot: str = "",
        console_errors: list[str] | None = None,
    ) -> None:
        result = CheckResult(
            name=name,
            status=status,
            detail=detail,
            url=url or self.current_url(),
            screenshot=screenshot,
            console_errors=console_errors or [],
        )
        self.results.append(result)
        icon = {"PASS": "PASS", "WARN": "WARN", "FAIL": "FAIL"}[status]
        print(f"[{icon}] {name}: {detail}")

    def pass_(self, name: str, detail: str, url: str = "") -> None:
        self.add_result("PASS", name, detail, url=url)

    def warn(self, name: str, detail: str, url: str = "") -> None:
        self.add_result("WARN", name, detail, url=url)

    def fail(self, name: str, detail: str, url: str = "") -> None:
        screenshot = self.screenshot(name) if self.driver else ""
        errors = self.console_errors() if self.driver else []
        self.add_result("FAIL", name, detail, url=url, screenshot=screenshot, console_errors=errors)

    def current_url(self) -> str:
        try:
            return self.driver.current_url if self.driver else ""
        except Exception:
            return ""

    def screenshot(self, name: str) -> str:
        if not self.driver:
            return ""
        safe = "".join(ch if ch.isalnum() else "_" for ch in name.lower()).strip("_")
        path = ARTIFACT_DIR / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{safe}.png"
        try:
            self.driver.save_screenshot(str(path))
            return str(path)
        except WebDriverException:
            return ""

    def pause(self, seconds: float = 0.25) -> None:
        if self.slow:
            time.sleep(max(seconds, 0.8))

    def goto(self, path: str) -> None:
        assert self.driver is not None
        self.driver.get(self.full_url(path))
        self.pause()

    def find(self, by: str, selector: str, timeout: int = 8) -> WebElement | None:
        if not self.wait:
            return None
        try:
            return WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, selector))
            )
        except TimeoutException:
            return None

    def visible(self, by: str, selector: str, timeout: int = 8) -> WebElement | None:
        if not self.driver:
            return None
        try:
            return WebDriverWait(self.driver, timeout).until(
                EC.visibility_of_element_located((by, selector))
            )
        except TimeoutException:
            return None

    def all(self, by: str, selector: str) -> list[WebElement]:
        if not self.driver:
            return []
        try:
            return self.driver.find_elements(by, selector)
        except WebDriverException:
            return []

    def click(self, el: WebElement) -> bool:
        if not self.driver:
            return False
        try:
            self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
            WebDriverWait(self.driver, 5).until(lambda _d: el.is_enabled())
            el.click()
            self.pause()
            return True
        except (ElementClickInterceptedException, WebDriverException):
            try:
                self.driver.execute_script("arguments[0].click();", el)
                self.pause()
                return True
            except (JavascriptException, WebDriverException):
                return False

    def wait_url_contains(self, fragment: str, timeout: int = 10) -> bool:
        if not self.driver:
            return False
        try:
            WebDriverWait(self.driver, timeout).until(EC.url_contains(fragment))
            return True
        except TimeoutException:
            return False

    def wait_document_ready(self, timeout: int = 10) -> bool:
        if not self.driver:
            return False
        try:
            WebDriverWait(self.driver, timeout).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            return True
        except TimeoutException:
            return False

    def console_errors(self) -> list[str]:
        if not self.driver:
            return []
        ignored = (
            "favicon.ico",
            "chrome-extension://",
            "ResizeObserver loop",
            "/api/auth/me/ - Failed to load resource: the server responded with a status of 401",
            "/api/auth/session-token/ - Failed to load resource: the server responded with a status of 403",
            "/api/auth/admin/users/ - Failed to load resource: the server responded with a status of 401",
            "/api/auth/admin/users/ - Failed to load resource: the server responded with a status of 403",
        )
        try:
            logs = self.driver.get_log("browser")
        except (ValueError, WebDriverException):
            return []
        errors = []
        for entry in logs:
            message = str(entry.get("message", ""))
            if entry.get("level") != "SEVERE":
                continue
            if any(part in message for part in ignored):
                continue
            errors.append(message[:500])
        return errors

    def check_console(self, context: str) -> None:
        errors = self.console_errors()
        if errors:
            self.fail(f"console errors - {context}", f"{len(errors)} severe console error(s): {errors[0][:180]}")
        else:
            self.pass_(f"console errors - {context}", "No severe browser console errors")

    def request(self, path: str, allow_redirects: bool = True) -> requests.Response | None:
        url = self.full_url(path)
        try:
            return self.session.get(url, timeout=25, allow_redirects=allow_redirects)
        except requests.RequestException as exc:
            self.fail(f"request {path}", f"Request failed: {type(exc).__name__}: {exc}", url=url)
            return None

    def run(self) -> None:
        self.check_public_routes()
        self.check_protected_redirects()
        self.check_api_events()

        browser_ok = self.build_driver()
        if browser_ok:
            try:
                self.browser_public_smoke()
                self.signup_flow()
                self.onboarding_flow()
                self.explore_flow()
                self.add_to_plan_flow()
                self.daily_plan_flow()
                self.optional_pages_flow()
                self.logout_flow()
            except Exception as exc:
                self.fail("unexpected e2e exception", f"{type(exc).__name__}: {exc}\n{traceback.format_exc(limit=5)}")
            finally:
                self.close()

        self.write_reports()
        self.print_summary()

    def check_public_routes(self) -> None:
        for path in ["/", "/login/", "/signup/", "/events/page/", "/api/events/"]:
            response = self.request(path)
            if response is None:
                continue
            content_type = response.headers.get("content-type", "")
            if response.status_code == 200:
                self.pass_(f"public route {path}", f"200 OK ({content_type})", url=response.url)
            else:
                self.fail(f"public route {path}", f"Expected 200, got {response.status_code}", url=response.url)

    def check_protected_redirects(self) -> None:
        expected = {
            "/onboarding/": "/onboarding/",
            "/daily-plan/": "/daily-plan/",
            "/profile/": "/profile/",
        }
        for path, next_value in expected.items():
            response = self.request(path, allow_redirects=False)
            if response is None:
                continue
            location = response.headers.get("location", "")
            parsed = urlparse(location)
            qs = parse_qs(parsed.query)
            if response.status_code in (301, 302, 303, 307, 308) and parsed.path.endswith("/login/"):
                actual_next = (qs.get("next") or [""])[0]
                if actual_next == next_value:
                    self.pass_(f"protected redirect {path}", f"Redirects to login with next={actual_next}")
                else:
                    self.warn(
                        f"protected redirect {path}",
                        f"Redirects to login but next was {actual_next!r}; expected {next_value!r}",
                    )
            elif response.status_code == 200:
                self.fail(f"protected redirect {path}", "Route returned 200 while logged out")
            else:
                self.fail(f"protected redirect {path}", f"Expected login redirect, got {response.status_code}")

    def check_api_events(self) -> None:
        response = self.request("/api/events/")
        if response is None:
            return
        if response.status_code != 200:
            self.fail("api events status", f"Expected 200, got {response.status_code}", url=response.url)
            return
        try:
            data = response.json()
        except ValueError as exc:
            self.fail("api events json", f"Invalid JSON: {exc}", url=response.url)
            return
        results = data.get("results") if isinstance(data, dict) else None
        count = data.get("count") if isinstance(data, dict) else None
        if isinstance(count, int) and count > 0 and isinstance(results, list) and results:
            self.pass_("api events data", f"count={count}, results={len(results)}", url=response.url)
        else:
            self.fail("api events data", f"Expected count/results > 0, got count={count}, results={len(results or [])}", url=response.url)
            return
        first = results[0]
        required = ["id", "title", "category"]
        optional = ["latitude", "longitude", "rating"]
        missing = [key for key in required if first.get(key) in (None, "")]
        available_optional = [key for key in optional if first.get(key) not in (None, "")]
        if missing:
            self.fail("api events first result fields", f"Missing required fields: {missing}")
        else:
            self.pass_(
                "api events first result fields",
                f"Required fields present; optional present: {available_optional or 'none'}",
            )

    def browser_public_smoke(self) -> None:
        for path in ["/", "/login/", "/signup/", "/events/page/"]:
            self.goto(path)
            self.wait_document_ready()
            if self.driver and self.driver.title:
                self.pass_(f"browser page {path}", f"Loaded title: {self.driver.title}")
            else:
                self.fail(f"browser page {path}", "Page loaded without title")
            self.check_console(path)

    def signup_flow(self) -> None:
        self.goto("/signup/")
        form = self.visible(By.ID, "signup-form", 10)
        if not form:
            self.fail("signup form", "Signup form #signup-form did not render")
            return

        fields = {
            "signup-name": "Tizahab E2E User",
            "signup-email": self.test_email,
            "signup-password": self.test_password,
            "signup-confirm": self.test_password,
        }
        try:
            for element_id, value in fields.items():
                el = self.visible(By.ID, element_id, 8)
                if not el:
                    self.fail("signup form fields", f"Missing #{element_id}")
                    return
                el.clear()
                el.send_keys(value)
            self.pass_("signup form fill", f"Filled unique email {self.test_email}")
        except WebDriverException as exc:
            self.fail("signup form fill", f"Could not fill signup form: {exc}")
            return

        btn = self.visible(By.ID, "signup-btn", 8)
        if not btn or not self.click(btn):
            self.fail("signup submit", "Could not click signup submit button")
            return

        success = self.wait_url_contains("/onboarding/", 18) or self.wait_url_contains("/home/", 2) or self.wait_url_contains("/daily-plan/", 2)
        if success:
            self.pass_("signup submit", f"Signup succeeded; current URL {self.current_url()}")
        else:
            error = self.visible(By.ID, "signup-error", 2)
            detail = error.text.strip() if error and error.is_displayed() else f"Unexpected URL {self.current_url()}"
            self.fail("signup submit", detail)
        self.check_console("signup")

    def onboarding_flow(self) -> None:
        self.goto("/onboarding/")
        if "/login/" in self.current_url():
            self.fail("onboarding access after signup", f"Redirected to login: {self.current_url()}")
            return

        cards = self.all(By.CSS_SELECTOR, ".interest-card")
        if not cards:
            self.fail("onboarding interests", "No .interest-card buttons found")
            return
        for card in cards[:3]:
            self.click(card)
        self.pass_("onboarding interests", f"Selected {min(3, len(cards))} interests")

        if not self.click_by_id("next-1", "onboarding next step 1"):
            return

        start = date.today() + timedelta(days=7)
        end = start + timedelta(days=1)
        self.set_input_value("startDate", start.isoformat())
        self.set_input_value("endDate", end.isoformat())
        self.pass_("onboarding dates", f"Set {start.isoformat()} to {end.isoformat()}")

        if not self.click_by_id("next-2", "onboarding next step 2"):
            return
        if not self.click_by_id("next-3", "onboarding next step 3"):
            return

        rating = self.find(By.CSS_SELECTOR, ".rating-pill[data-rating='4.0']", 4)
        if rating:
            self.click(rating)
            self.pass_("onboarding rating", "Selected 4.0+ rating")
        else:
            self.warn("onboarding rating", "Rating pill not found; continuing")

        budget_max = self.find(By.ID, "budgetMax", 4)
        if budget_max:
            self.set_input_value("budgetMax", "5000")
            self.pass_("onboarding budget", "Adjusted budget max")

        if not self.click_by_id("next-4", "onboarding next step 4"):
            return

        submit = self.visible(By.ID, "submit-btn", 8)
        if not submit or not self.click(submit):
            self.fail("onboarding submit", "Could not click Generate My Plan")
            return

        redirected = self.wait_url_contains("/daily-plan/", 15)
        if redirected:
            self.pass_("onboarding submit", f"Preferences saved; redirected to {self.current_url()}")
        else:
            msg = self.visible(By.ID, "pref-message", 3)
            detail = msg.text.strip() if msg and msg.is_displayed() else f"Unexpected URL {self.current_url()}"
            self.fail("onboarding submit", detail)
        self.check_console("onboarding")

    def click_by_id(self, element_id: str, check_name: str) -> bool:
        el = self.visible(By.ID, element_id, 8)
        if not el:
            self.fail(check_name, f"Missing #{element_id}")
            return False
        if not self.click(el):
            self.fail(check_name, f"Could not click #{element_id}")
            return False
        self.pass_(check_name, f"Clicked #{element_id}")
        return True

    def set_input_value(self, element_id: str, value: str) -> None:
        if not self.driver:
            return
        self.driver.execute_script(
            """
            const el = document.getElementById(arguments[0]);
            if (!el) return;
            el.value = arguments[1];
            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            """,
            element_id,
            value,
        )

    def explore_flow(self) -> None:
        self.goto("/events/page/")
        if "/login/" in self.current_url():
            self.fail("explore access", "Explore redirected to login for authenticated test user")
            return

        cards = self.wait_for_cards(".event-card", "explore event cards", timeout=25)
        if cards:
            self.pass_("explore cards", f"{len(cards)} event/place cards rendered")
        else:
            self.fail("explore cards", "No .event-card rendered")
            return

        search = self.visible(By.ID, "searchInput", 8)
        if search:
            search.clear()
            search.send_keys("park")
            self.wait_grid_settled()
            cards_after = self.all(By.CSS_SELECTOR, ".event-card")
            no_places = self.page_contains("No places found")
            if cards_after or no_places:
                self.pass_("explore search", f"Search for 'park' completed; cards={len(cards_after)}, empty_state={no_places}")
            else:
                self.warn("explore search", "Search ran but no cards or empty-state text was detected")

            clear = self.visible(By.ID, "clearSearchBtn", 4)
            if clear:
                self.click(clear)
                self.wait_grid_settled()
                self.pass_("explore clear search", "Clear search button worked")
            else:
                search.clear()
                self.warn("explore clear search", "No visible clear button; cleared input directly")
        else:
            self.fail("explore search", "Missing #searchInput")

        for cat in ["food", "culture", "nature"]:
            pill = self.find(By.CSS_SELECTOR, f".cat-pill[data-cat='{cat}']", 6)
            if not pill:
                self.warn(f"explore category {cat}", "Category pill missing")
                continue
            self.click(pill)
            self.wait_grid_settled()
            cards_now = self.all(By.CSS_SELECTOR, ".event-card")
            if cards_now or self.page_contains("No places found"):
                self.pass_(f"explore category {cat}", f"Filter stable; cards={len(cards_now)}")
            else:
                self.fail(f"explore category {cat}", "Filter left grid in unknown state")

        all_pill = self.find(By.CSS_SELECTOR, ".cat-pill[data-cat='']", 4)
        if all_pill:
            self.click(all_pill)
            self.wait_grid_settled()
        self.check_console("explore")

    def add_to_plan_flow(self) -> None:
        self.goto("/events/page/")
        cards = self.wait_for_cards(".event-card", "add to plan cards", timeout=20)
        if not cards:
            self.fail("add to plan", "No event cards available")
            return

        btns = self.all(By.CSS_SELECTOR, ".add-to-plan-btn")
        if not btns:
            self.warn("add to plan", "No Add buttons rendered on event cards")
            return

        if not self.click(btns[0]):
            self.fail("add to plan", "Could not click first Add button")
            return

        try:
            WebDriverWait(self.driver, 12).until(
                lambda d: "Added" in btns[0].text
                or "Added to your plan" in d.find_element(By.TAG_NAME, "body").text
                or "/login/" in d.current_url
            )
        except TimeoutException:
            pass

        if "/login/" in self.current_url():
            self.fail("add to plan", "Authenticated test user was redirected to login")
        elif "Added" in btns[0].text or self.page_contains("Added to your plan"):
            self.pass_("add to plan", "Event was added or success toast appeared")
        else:
            self.warn("add to plan", "Clicked Add, but no explicit success toast/button state was detected")
        self.check_console("add to plan")

    def daily_plan_flow(self) -> None:
        self.goto("/daily-plan/")
        if "/login/" in self.current_url():
            self.fail("daily plan access", "Authenticated test user was redirected to login")
            return

        if self.visible(By.ID, "timeline", 15) or self.visible(By.ID, "emptyState", 5):
            self.pass_("daily plan shell", "Timeline/empty-state container is present")
        else:
            self.fail("daily plan shell", "Timeline and empty-state containers missing")

        gen = self.visible(By.ID, "generate-plan-btn", 10)
        if not gen:
            self.fail("daily plan generate button", "Missing #generate-plan-btn")
            return
        self.pass_("daily plan generate button", "Generate Plan button exists")

        if self.click(gen):
            self.wait_daily_plan_result()
        else:
            self.fail("daily plan generate", "Could not click Generate Plan")

        activities = self.all(By.CSS_SELECTOR, "#timeline article, #timeline [data-event-id], #timeline button")
        message = self.visible(By.ID, "plan-message", 2)
        visible_message = message.text.strip() if message and message.is_displayed() else ""
        if self.all(By.CSS_SELECTOR, "#timeline article"):
            self.pass_("daily plan result", f"Activities/timeline cards appeared")
        elif visible_message:
            if "Could not" in visible_message or "No places" in visible_message or "preferences" in visible_message:
                self.warn("daily plan result", f"Clear user-facing message: {visible_message}")
            else:
                self.pass_("daily plan result", f"User-facing message: {visible_message}")
        elif activities:
            self.pass_("daily plan result", "Timeline controls rendered after generation")
        else:
            self.fail("daily plan result", "No activities and no clear user-facing message after generation")

        self.optional_activity_mutations()
        self.check_console("daily plan")

    def optional_activity_mutations(self) -> None:
        buttons = self.all(By.XPATH, "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'replace') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'remove')]")
        if not buttons:
            self.warn("daily plan replace/remove", "No optional replace/remove buttons visible")
            return
        target = buttons[0]
        label = target.text.strip() or "activity action"
        if self.click(target):
            time.sleep(1 if self.slow else 0.3)
            if "/daily-plan/" in self.current_url():
                self.pass_("daily plan replace/remove", f"Clicked optional '{label}' and page remained stable")
            else:
                self.fail("daily plan replace/remove", f"After clicking '{label}', URL changed to {self.current_url()}")
        else:
            self.warn("daily plan replace/remove", f"Optional button '{label}' could not be clicked")

    def optional_pages_flow(self) -> None:
        for path in ["/booking/", "/car-rental/", "/travel-guide/", "/settings/", "/profile/"]:
            self.goto(path)
            self.wait_document_ready()
            if self.status_from_browser() == 404 or "Not Found" in (self.driver.title if self.driver else ""):
                self.warn(f"optional page {path}", "Route missing / 404")
                continue
            if "/login/" in self.current_url():
                self.warn(f"optional page {path}", "Redirected to login")
                continue
            h1 = self.find(By.TAG_NAME, "h1", 5)
            main_text = self.body_text()[:120].replace("\n", " ")
            if h1 and h1.text.strip():
                self.pass_(f"optional page {path}", f"H1: {h1.text.strip()[:80]}")
            elif main_text:
                self.pass_(f"optional page {path}", f"Main content present: {main_text}")
            else:
                self.fail(f"optional page {path}", "No visible title/H1/main content")
            self.check_console(f"optional {path}")

    def logout_flow(self) -> None:
        self.goto("/profile/")
        if "/login/" in self.current_url():
            self.warn("logout", "Already logged out before logout flow")
        else:
            btn = self.find(By.XPATH, "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'logout')]", 5)
            if btn and self.click(btn):
                self.wait_url_contains("/login/", 10)
                self.pass_("logout click", f"Clicked logout; current URL {self.current_url()}")
            else:
                self.goto("/logout/")
                self.wait_url_contains("/login/", 10)
                self.pass_("logout fallback", f"Visited /logout/; current URL {self.current_url()}")

        self.goto("/daily-plan/")
        if "/login/" in self.current_url():
            self.pass_("post-logout protected redirect", "Protected page redirected to login after logout")
        else:
            self.fail("post-logout protected redirect", f"Protected page did not redirect after logout: {self.current_url()}")

    def wait_for_cards(self, selector: str, name: str, timeout: int = 15) -> list[WebElement]:
        if not self.driver:
            return []
        try:
            WebDriverWait(self.driver, timeout).until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, selector))
            )
        except TimeoutException:
            self.warn(name, f"No cards matching {selector} within {timeout}s")
        return self.all(By.CSS_SELECTOR, selector)

    def wait_grid_settled(self) -> None:
        if not self.driver:
            return
        try:
            WebDriverWait(self.driver, 12).until(
                lambda d: d.find_elements(By.CSS_SELECTOR, ".event-card")
                or "No places found" in d.find_element(By.TAG_NAME, "body").text
            )
        except TimeoutException:
            pass
        self.pause()

    def wait_daily_plan_result(self) -> None:
        if not self.driver:
            return
        try:
            WebDriverWait(self.driver, 25).until(
                lambda d: d.find_elements(By.CSS_SELECTOR, "#timeline article")
                or (
                    d.find_elements(By.ID, "plan-message")
                    and d.find_element(By.ID, "plan-message").is_displayed()
                    and d.find_element(By.ID, "plan-message").text.strip()
                )
                or (
                    d.find_elements(By.ID, "emptyState")
                    and d.find_element(By.ID, "emptyState").is_displayed()
                )
            )
        except TimeoutException:
            pass

    def page_contains(self, text: str) -> bool:
        return text.lower() in self.body_text().lower()

    def body_text(self) -> str:
        if not self.driver:
            return ""
        try:
            return self.driver.find_element(By.TAG_NAME, "body").text
        except NoSuchElementException:
            return ""

    def status_from_browser(self) -> int | None:
        if not self.driver:
            return None
        try:
            value = self.driver.execute_script(
                "return document.title.includes('404') || document.body.innerText.includes('Not Found') ? 404 : 200;"
            )
            return int(value)
        except (JavascriptException, WebDriverException, TypeError, ValueError):
            return None

    def write_reports(self) -> None:
        counts = self.counts()
        verdict = self.verdict()
        payload = {
            "base_url": self.base_url,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "test_email": self.test_email,
            "counts": counts,
            "verdict": verdict,
            "results": [asdict(result) for result in self.results],
        }
        JSON_REPORT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

        lines = [
            "Tizahab Render E2E Report",
            f"URL: {self.base_url}",
            f"Created: {payload['created_at']}",
            f"Test user: {self.test_email}",
            "",
            f"Total checks: {counts['total']}",
            f"Passed: {counts['passed']}",
            f"Warnings: {counts['warnings']}",
            f"Failed: {counts['failed']}",
            f"Final verdict: {verdict}",
            "",
            "Results:",
        ]
        for i, result in enumerate(self.results, 1):
            lines.append(f"{i:02d}. [{result.status}] {result.name}: {result.detail}")
            if result.url:
                lines.append(f"    URL: {result.url}")
            if result.screenshot:
                lines.append(f"    Screenshot: {result.screenshot}")
            if result.console_errors:
                for err in result.console_errors[:3]:
                    lines.append(f"    Console: {err}")
        TEXT_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def counts(self) -> dict[str, int]:
        return {
            "total": len(self.results),
            "passed": sum(1 for item in self.results if item.status == "PASS"),
            "warnings": sum(1 for item in self.results if item.status == "WARN"),
            "failed": sum(1 for item in self.results if item.status == "FAIL"),
        }

    def verdict(self) -> str:
        return "SAFE TO DEMO" if self.counts()["failed"] == 0 else "NOT SAFE TO DEMO"

    def print_summary(self) -> None:
        counts = self.counts()
        print("\n" + "=" * 72)
        print("TIZAHAB RENDER E2E SUMMARY")
        print("=" * 72)
        print(f"URL: {self.base_url}")
        print(f"total checks: {counts['total']}")
        print(f"passed:       {counts['passed']}")
        print(f"warnings:     {counts['warnings']}")
        print(f"failed:       {counts['failed']}")
        print(f"final verdict: {self.verdict()}")
        print(f"json report:  {JSON_REPORT}")
        print(f"text report:  {TEXT_REPORT}")
        print("=" * 72)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Tizahab Render production E2E test suite")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Base URL to test (default: {DEFAULT_URL})")
    parser.add_argument("--headless", action="store_true", help="Run Chrome in headless mode")
    parser.add_argument("--slow", action="store_true", help="Slow down interactions for visual debugging")
    return parser.parse_args()


def main() -> int:
    if MISSING_DEPS:
        print("Missing Python dependencies:", ", ".join(sorted(set(MISSING_DEPS))))
        print("Install with:")
        print("    pip install selenium webdriver-manager requests")
        return 2

    args = parse_args()
    tester = RenderJourneyTester(base_url=args.url, headless=args.headless, slow=args.slow)
    tester.run()
    return 1 if tester.counts()["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
