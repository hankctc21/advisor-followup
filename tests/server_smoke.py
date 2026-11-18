"""Run against a disposable Compose stack at loopback. Passwords come from the environment."""
import base64
import concurrent.futures
import http.cookiejar
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


class Client:
    def __init__(self, user, variable):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        auth = base64.b64encode((user + ":" + os.environ[variable]).encode()).decode()
        self.headers = {"Authorization": "Basic " + auth, "Content-Type": "application/json"}
        self.headers["X-XSRF-TOKEN"] = self.call("session")["csrf"]

    def call(self, path, body=None):
        req = urllib.request.Request("http://127.0.0.1:8080/api/" + path,
                                     headers=self.headers,
                                     data=None if body is None else json.dumps(body).encode())
        with self.http.open(req, timeout=10) as response:
            data = response.read()
            return json.loads(data) if data else None


def rejected(status, action):
    try:
        action()
    except urllib.error.HTTPError as exc:
        assert exc.code == status, exc.code
    else:
        raise AssertionError(f"Expected HTTP {status}")


def compose(*args):
    subprocess.run(["docker", "compose", *args], check=True)


def wait_task(client, task_id, predicate):
    deadline = time.monotonic() + 80
    while time.monotonic() < deadline:
        board = client.call("board")
        task = next(row for row in board["tasks"] if row["id"] == task_id)
        if predicate(task):
            return task
        time.sleep(.25)
    raise TimeoutError("Expected delivery state was not observed")


def verify(failover):
    a, b = Client("advisor-a", "ADVISOR_PASSWORD"), Client("advisor-b", "SECOND_PASSWORD")
    data = {"key":str(uuid.uuid4()), "caseRef":"CASE-770", "kind":"서류 확인", "dueDate":"2027-01-10"}
    if failover:
        assert not a.call("board")["paused"], "Resume delivery in the disposable stack first"
        compose("stop", "worker-b")
    try:
        def submit(_):
            return Client("advisor-a", "ADVISOR_PASSWORD").call("tasks", data)["id"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            ids = list(pool.map(submit, range(4)))
        assert len(set(ids)) == 1
        task_id = ids[0]
        rejected(409, lambda: a.call("tasks", dict(data, kind="재연락")))
        rejected(404, lambda: b.call(f"tasks/{task_id}/done", {}))
        assert task_id not in [r["id"] for r in b.call("board")["tasks"]]
        if failover:
            wait_task(a,task_id,lambda r: r["received"] and not r["sent"] and r["owner"]=="worker-a")
            compose("kill", "-s", "SIGKILL", "worker-a")
            compose("start", "worker-b")
        task = wait_task(a,task_id,lambda r:r["sent"] and r["received"])
        if failover:
            assert task["owner"]=="worker-b" and task["fence"] >= 2
            events = [e["action"] for e in a.call("board")["events"] if e["task_id"]==task_id]
            assert events.count("수신함 반영")==1 and "기존 수신 확인 · 중복 생략" in events
        a.call(f"tasks/{task_id}/done", {})
        wait_task(a,task_id,lambda r:r["done"])
        print("PASS: idempotency, conflict response, ownership, delivery and completion")
    finally:
        if failover:
            compose("start", "worker-a", "worker-b")


if __name__ == "__main__":
    verify("--failover" in sys.argv)
