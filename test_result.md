#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Convert this Expo mobile app to a React web app. Keep the FastAPI backend
  and MongoDB as-is. Rebuild the frontend with React + Tailwind for desktop
  browsers. Style direction: hybrid layouts (1c), make it WOW.

backend:
  - task: "FastAPI server kept as-is (TripOpt backend)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Backend untouched aside from installing missing runtime deps
          (apscheduler, httpx) into the venv and adding them to
          requirements.txt. All endpoints (/api/airports, /api/destinations,
          /api/airports/search, /api/optimize, /api/auth/*, /api/trips,
          /api/trips/{id}/watch, /api/payments/*, /api/notifications) are
          serving 200 OK from FastAPI on port 8001 and reachable via the new
          Vite dev server proxy at /api/*.

frontend:
  - task: "Replace Expo frontend with Vite + React + Tailwind desktop SPA"
    implemented: true
    working: true
    file: "/app/frontend (full rewrite)"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Full rewrite of the frontend. Old Expo project preserved at
          /app/frontend.expo.bak. New stack: Vite 6 + React 19 + TypeScript +
          Tailwind 3 + react-router-dom 7 + framer-motion + recharts +
          lucide-react. Supervisor expo command (read-only) is honoured via a
          shim binary at node_modules/.bin/expo that hands off to vite on
          port 3000. Vite proxies /api/* to http://localhost:8001 so requests
          work both in container preview and behind the public ingress.

          Pages built (all desktop-first, hybrid layouts, dark navy hero
          panels with animated gradient meshes, big bold display numbers):
          - / Search: split hero + animated globe SVG + glass form card,
            picker modal with debounced live airport search, recent search
            chips, big bold £ slider with presets, weather + hotel chips.
          - /loading: cinematic gradient mesh hero with huge 01/06 counter
            and stage progress list.
          - /results: dark verdict banner with gradient headline + 3-col
            grid of trip cards with hover lift, rank chips, recommendation
            dots, save bookmark with optimistic state.
          - /trip/:id: huge gradient price hero, verdict + Recharts price
            history/forecast chart (history solid, forecast dashed), 3-col
            grid (Flight / Hotel / Why this trip dark card with glow),
            sticky bottom action bar (Share / Save / Watch / Book flight /
            Book hotel).
          - /saved: dark hero + grid of saved trip cards with watch
            toggle, open and delete actions; empty state.
          - /alerts: inbox-style list with read/unread states and routing
            to source saved trip.
          - /login: split-screen with dark left value-prop and right
            Google CTA; handles Emergent OAuth #session_id hash exchange.
          - /upgrade: hero with benefits list + premium pricing card with
            Stripe checkout + automatic ?session_id= polling on return.

          Verified end-to-end: airports load, picker live search hits
          /api/airports/search?q=barc, /api/optimize completes successfully,
          results -> trip detail navigation works, sparkline renders with
          live price_history + price_forecast, confidence renders correctly
          as 65% (helper handles both 0-1 and 0-100 inputs).

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Replace Expo frontend with Vite + React + Tailwind desktop SPA"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Frontend has been fully replaced with a React + Vite + Tailwind
      desktop web app. Backend is unchanged. End-to-end flow verified
      manually via screenshots (search -> loading -> results -> trip
      detail). Ready for user smoke test or formal frontend testing if the
      user requests it.
