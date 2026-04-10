import os, json, sqlite3
from datetime import datetime, date, timedelta
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import anthropic

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "deadlineiq-secret-2024")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///deadlineiq.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

# ─── Models ──────────────────────────────────────────────────────────

class User(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(100), nullable=False)
    email      = db.Column(db.String(150), unique=True, nullable=False)
    password   = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    courses     = db.relationship("Course", backref="user", lazy=True, cascade="all,delete")

class Course(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    name          = db.Column(db.String(150), nullable=False)
    code          = db.Column(db.String(20), nullable=False)
    credits       = db.Column(db.Integer, default=3)
    color         = db.Column(db.String(10), default="#6c63ff")
    current_grade = db.Column(db.Float, default=80.0)
    w_assignments = db.Column(db.Float, default=40.0)
    w_midterm     = db.Column(db.Float, default=25.0)
    w_final       = db.Column(db.Float, default=35.0)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    assignments   = db.relationship("Assignment", backref="course", lazy=True, cascade="all,delete")

    def to_dict(self):
        return dict(id=self.id, name=self.name, code=self.code, credits=self.credits,
                    color=self.color, current_grade=self.current_grade,
                    grade_weight=dict(assignments=self.w_assignments, midterm=self.w_midterm, final=self.w_final),
                    assignment_count=len(self.assignments))

class Assignment(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    course_id   = db.Column(db.Integer, db.ForeignKey("course.id"), nullable=False)
    title       = db.Column(db.String(200), nullable=False)
    type        = db.Column(db.String(50), default="Problem Set")
    due_date    = db.Column(db.String(20), nullable=False)
    weight      = db.Column(db.Float, default=10.0)
    est_hours   = db.Column(db.Float, default=2.0)
    status      = db.Column(db.String(30), default="Not Started")
    grade       = db.Column(db.Float, nullable=True)
    notes       = db.Column(db.Text, default="")
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    subtasks    = db.relationship("Subtask", backref="assignment", lazy=True, cascade="all,delete")

    def days_until(self):
        try:
            due = datetime.strptime(self.due_date, "%Y-%m-%d").date()
            return (due - date.today()).days
        except:
            return 999

    def to_dict(self):
        return dict(id=self.id, course_id=self.course_id, title=self.title, type=self.type,
                    due_date=self.due_date, weight=self.weight, est_hours=self.est_hours,
                    status=self.status, grade=self.grade, notes=self.notes,
                    days_until=self.days_until(),
                    course_code=self.course.code if self.course else "",
                    course_color=self.course.color if self.course else "#6c63ff",
                    subtasks=[s.to_dict() for s in self.subtasks])

class Subtask(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey("assignment.id"), nullable=False)
    title         = db.Column(db.String(200), nullable=False)
    done          = db.Column(db.Boolean, default=False)
    assignee      = db.Column(db.String(100), default="")

    def to_dict(self):
        return dict(id=self.id, title=self.title, done=self.done, assignee=self.assignee)

# ─── Auth helpers ─────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated

def current_user():
    return User.query.get(session["user_id"]) if "user_id" in session else None

# ─── Auth routes ──────────────────────────────────────────────────────

@app.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))

@app.route("/login", methods=["GET","POST"])
def login():
    if request.method == "POST":
        data = request.get_json() or request.form
        email = data.get("email","").strip().lower()
        pw    = data.get("password","")
        user  = User.query.filter_by(email=email).first()
        if user and check_password_hash(user.password, pw):
            session["user_id"] = user.id
            if request.is_json:
                return jsonify(ok=True, name=user.name)
            return redirect(url_for("dashboard"))
        if request.is_json:
            return jsonify(ok=False, error="Invalid credentials"), 401
        flash("Invalid email or password", "error")
    return render_template("login.html")

@app.route("/register", methods=["GET","POST"])
def register():
    if request.method == "POST":
        data  = request.get_json() or request.form
        name  = data.get("name","").strip()
        email = data.get("email","").strip().lower()
        pw    = data.get("password","")
        if User.query.filter_by(email=email).first():
            if request.is_json:
                return jsonify(ok=False, error="Email already registered"), 409
            flash("Email already registered", "error")
            return render_template("register.html")
        user = User(name=name, email=email, password=generate_password_hash(pw))
        db.session.add(user)
        db.session.commit()
        _seed_demo(user.id)
        session["user_id"] = user.id
        if request.is_json:
            return jsonify(ok=True, name=name)
        return redirect(url_for("dashboard"))
    return render_template("register.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# ─── Page routes ─────────────────────────────────────────────────────

@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("app.html", page="dashboard", user=current_user())

@app.route("/app/<page>")
@login_required
def app_page(page):
    valid = ["dashboard","assignments","courses","ai","study","grade","collision","group","calendar","productivity"]
    if page not in valid:
        return redirect(url_for("dashboard"))
    return render_template("app.html", page=page, user=current_user())

# ─── API: Courses ─────────────────────────────────────────────────────

@app.route("/api/courses", methods=["GET"])
@login_required
def api_courses():
    uid = session["user_id"]
    return jsonify([c.to_dict() for c in Course.query.filter_by(user_id=uid).all()])

@app.route("/api/courses", methods=["POST"])
@login_required
def api_course_create():
    d = request.json
    c = Course(user_id=session["user_id"], name=d["name"], code=d["code"],
               credits=d.get("credits",3), color=d.get("color","#6c63ff"),
               current_grade=d.get("current_grade",80),
               w_assignments=d.get("grade_weight",{}).get("assignments",40),
               w_midterm=d.get("grade_weight",{}).get("midterm",25),
               w_final=d.get("grade_weight",{}).get("final",35))
    db.session.add(c); db.session.commit()
    return jsonify(c.to_dict()), 201

@app.route("/api/courses/<int:cid>", methods=["PUT"])
@login_required
def api_course_update(cid):
    c = Course.query.filter_by(id=cid, user_id=session["user_id"]).first_or_404()
    d = request.json
    for k,v in d.items():
        if k == "grade_weight":
            c.w_assignments = v.get("assignments", c.w_assignments)
            c.w_midterm     = v.get("midterm", c.w_midterm)
            c.w_final       = v.get("final", c.w_final)
        elif hasattr(c, k):
            setattr(c, k, v)
    db.session.commit()
    return jsonify(c.to_dict())

@app.route("/api/courses/<int:cid>", methods=["DELETE"])
@login_required
def api_course_delete(cid):
    c = Course.query.filter_by(id=cid, user_id=session["user_id"]).first_or_404()
    db.session.delete(c); db.session.commit()
    return jsonify(ok=True)

# ─── API: Assignments ─────────────────────────────────────────────────

@app.route("/api/assignments", methods=["GET"])
@login_required
def api_assignments():
    uid = session["user_id"]
    cids = [c.id for c in Course.query.filter_by(user_id=uid).all()]
    assignments = Assignment.query.filter(Assignment.course_id.in_(cids)).order_by(Assignment.due_date).all()
    return jsonify([a.to_dict() for a in assignments])

@app.route("/api/assignments", methods=["POST"])
@login_required
def api_assignment_create():
    d = request.json
    # verify course belongs to user
    course = Course.query.filter_by(id=d["course_id"], user_id=session["user_id"]).first_or_404()
    a = Assignment(course_id=d["course_id"], title=d["title"], type=d.get("type","Problem Set"),
                   due_date=d["due_date"], weight=d.get("weight",10),
                   est_hours=d.get("est_hours",2), status=d.get("status","Not Started"),
                   grade=d.get("grade"), notes=d.get("notes",""))
    db.session.add(a)
    db.session.commit()
    for s in d.get("subtasks", []):
        st = Subtask(assignment_id=a.id, title=s["title"], done=s.get("done",False), assignee=s.get("assignee",""))
        db.session.add(st)
    db.session.commit()
    return jsonify(a.to_dict()), 201

@app.route("/api/assignments/<int:aid>", methods=["PUT"])
@login_required
def api_assignment_update(aid):
    uid  = session["user_id"]
    cids = [c.id for c in Course.query.filter_by(user_id=uid).all()]
    a    = Assignment.query.filter(Assignment.id==aid, Assignment.course_id.in_(cids)).first_or_404()
    d    = request.json
    for k in ["title","type","due_date","weight","est_hours","status","grade","notes"]:
        if k in d: setattr(a, k, d[k])
    if "subtasks" in d:
        Subtask.query.filter_by(assignment_id=aid).delete()
        for s in d["subtasks"]:
            st = Subtask(assignment_id=aid, title=s["title"], done=s.get("done",False), assignee=s.get("assignee",""))
            db.session.add(st)
    db.session.commit()
    return jsonify(a.to_dict())

@app.route("/api/assignments/<int:aid>", methods=["DELETE"])
@login_required
def api_assignment_delete(aid):
    uid  = session["user_id"]
    cids = [c.id for c in Course.query.filter_by(user_id=uid).all()]
    a    = Assignment.query.filter(Assignment.id==aid, Assignment.course_id.in_(cids)).first_or_404()
    db.session.delete(a); db.session.commit()
    return jsonify(ok=True)

@app.route("/api/subtasks/<int:sid>/toggle", methods=["POST"])
@login_required
def api_subtask_toggle(sid):
    s = Subtask.query.get_or_404(sid)
    s.done = not s.done
    db.session.commit()
    return jsonify(done=s.done)

# ─── API: AI features ─────────────────────────────────────────────────

def get_anthropic():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    return anthropic.Anthropic(api_key=api_key)

@app.route("/api/ai/priority", methods=["POST"])
@login_required
def api_ai_priority():
    uid  = session["user_id"]
    cids = [c.id for c in Course.query.filter_by(user_id=uid).all()]
    tasks = Assignment.query.filter(Assignment.course_id.in_(cids),
                                    Assignment.status != "Completed").all()
    task_list = [dict(index=i, title=t.title, course=t.course.name,
                      due=t.due_date, days_until=t.days_until(),
                      weight=t.weight, est_hours=t.est_hours,
                      type=t.type, status=t.status)
                 for i, t in enumerate(tasks)]

    client = get_anthropic()
    if not client:
        # Smart fallback
        result = []
        for i, t in enumerate(tasks):
            d = t.days_until()
            priority = "High" if d <= 2 else "Medium" if d <= 5 else "Low"
            urgency  = max(1, min(10, 10 - d + int(t.weight / 10)))
            result.append(dict(id=t.id, priority=priority, urgency=urgency,
                               reasoning=f"Due in {d} days with {t.weight}% weight. Est. {t.est_hours}h work. {'Immediate action required.' if d<=2 else 'Plan ahead.'}",
                               suggested_hours_today=round(min(t.est_hours, max(0.5, t.est_hours / max(1, d))), 1)))
        result.sort(key=lambda x: -x["urgency"])
        return jsonify(result)

    prompt = f"""Rank these {len(task_list)} assignments by priority for a student.
For each: priority (High/Medium/Low), urgency 1-10, 2-3 sentence reasoning, suggestedHoursToday.
Tasks: {json.dumps(task_list)}
Return ONLY a JSON array. Each item must have: index (int), priority, urgency, reasoning, suggestedHoursToday."""

    try:
        msg = client.messages.create(model="claude-opus-4-5", max_tokens=1500,
            messages=[{"role":"user","content":prompt}],
            system="Academic planning AI. Return only valid JSON array, no markdown fences.")
        text = msg.content[0].text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        rankings = json.loads(text)
        result = []
        for r in rankings:
            idx = r.get("id_index", r.get("index", 0))
            if 0 <= idx < len(tasks):
                t = tasks[idx]
                result.append(dict(id=t.id, title=t.title, course_code=t.course.code,
                                   due_date=t.due_date, days_until=t.days_until(),
                                   weight=t.weight, est_hours=t.est_hours,
                                   course_color=t.course.color,
                                   priority=r.get("priority","Medium"),
                                   urgency=r.get("urgency",5),
                                   reasoning=r.get("reasoning",""),
                                   suggested_hours_today=r.get("suggestedHoursToday",1)))
        return jsonify(result)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/ai/study-plan", methods=["POST"])
@login_required
def api_ai_study_plan():
    uid       = session["user_id"]
    free_hrs  = request.json.get("free_hours", 4)
    cids      = [c.id for c in Course.query.filter_by(user_id=uid).all()]
    tasks     = Assignment.query.filter(Assignment.course_id.in_(cids),
                                        Assignment.status != "Completed").all()
    task_list = [dict(title=t.title, course=t.course.code, due=t.due_date,
                      days_until=t.days_until(), est_hours=t.est_hours, weight=t.weight)
                 for t in tasks]

    client = get_anthropic()
    if not client:
        days = []
        for i in range(7):
            dt = (date.today() + timedelta(days=i)).isoformat()
            label = ["Today","Tomorrow","Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i] if i < 9 else dt
            day_tasks = [t for t in tasks if 0 < t.days_until() <= i+3][:2]
            blocks = [dict(task=t.title, course=t.course.code, hours=round(min(2, t.est_hours/3),1),
                           note=f"Due {t.due_date}", course_color=t.course.color) for t in day_tasks]
            days.append(dict(date=dt, day_label=label, total_hours=sum(b["hours"] for b in blocks), blocks=blocks))
        return jsonify(dict(days=days))

    prompt = f"""Create a 7-day study plan. Student has {free_hrs} free hours/day.
Tasks: {json.dumps(task_list)}
Return ONLY JSON: {{"days":[{{"date":"YYYY-MM-DD","day_label":"string","total_hours":number,"blocks":[{{"task":"string","course":"string","hours":number,"note":"string"}}]}}]}}"""

    try:
        msg  = client.messages.create(model="claude-opus-4-5", max_tokens=1500,
            messages=[{"role":"user","content":prompt}],
            system="Study planning AI. Return only valid JSON, no markdown.")
        text = msg.content[0].text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        plan = json.loads(text)
        # inject colors
        code_color = {c.code: c.color for c in Course.query.filter_by(user_id=uid).all()}
        for day in plan.get("days", []):
            for b in day.get("blocks", []):
                b["course_color"] = code_color.get(b.get("course",""), "#6c63ff")
        return jsonify(plan)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/ai/subtasks", methods=["POST"])
@login_required
def api_ai_subtasks():
    d      = request.json
    aid    = d.get("assignment_id")
    uid    = session["user_id"]
    cids   = [c.id for c in Course.query.filter_by(user_id=uid).all()]
    a      = Assignment.query.filter(Assignment.id==aid, Assignment.course_id.in_(cids)).first_or_404()

    client = get_anthropic()
    if not client:
        defaults = ["Research and gather sources","Create outline / plan","Draft initial content",
                    "Complete main work","Review and revise","Final check & submission prep"]
        for title in defaults[:5]:
            db.session.add(Subtask(assignment_id=aid, title=title))
        db.session.commit()
        return jsonify(a.to_dict())

    prompt = f"""Break down this assignment into 5-7 concrete subtasks for a group project.
Assignment: "{a.title}" ({a.course.name}, {a.type}, due {a.due_date}, {a.est_hours}h)
Notes: {a.notes or 'none'}
Return ONLY JSON array: [{{"title":"string","hours":number,"role":"string"}}]"""

    try:
        msg  = client.messages.create(model="claude-opus-4-5", max_tokens=800,
            messages=[{"role":"user","content":prompt}],
            system="Project management AI. Return only valid JSON array.")
        text = msg.content[0].text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        subs = json.loads(text)
        for s in subs:
            title = s["title"] + (f" ({s['role']})" if s.get("role") else "")
            db.session.add(Subtask(assignment_id=aid, title=title))
        db.session.commit()
        db.session.refresh(a)
        return jsonify(a.to_dict())
    except Exception as e:
        return jsonify(error=str(e)), 500

# ─── API: Stats ───────────────────────────────────────────────────────

@app.route("/api/stats", methods=["GET"])
@login_required
def api_stats():
    uid  = session["user_id"]
    cids = [c.id for c in Course.query.filter_by(user_id=uid).all()]
    all_a = Assignment.query.filter(Assignment.course_id.in_(cids)).all()
    completed = [a for a in all_a if a.status == "Completed"]
    active    = [a for a in all_a if a.status != "Completed"]
    urgent    = [a for a in active if a.days_until() <= 3]
    grades    = [a.grade for a in completed if a.grade is not None]
    avg_grade = sum(grades)/len(grades) if grades else 0
    return jsonify(dict(
        total=len(all_a), completed=len(completed), active=len(active),
        urgent=len(urgent), avg_grade=round(avg_grade,1),
        total_pending_hours=sum(a.est_hours for a in active)
    ))

@app.route("/api/collisions", methods=["GET"])
@login_required
def api_collisions():
    uid  = session["user_id"]
    cids = [c.id for c in Course.query.filter_by(user_id=uid).all()]
    active = Assignment.query.filter(Assignment.course_id.in_(cids),
                                     Assignment.status != "Completed").all()
    by_day = {}
    for a in active:
        if a.due_date not in by_day:
            by_day[a.due_date] = []
        by_day[a.due_date].append(a.to_dict())

    collisions = []
    for dt, items in sorted(by_day.items()):
        total_h = sum(x["est_hours"] for x in items)
        if len(items) > 1 or total_h > 6:
            suggestions = []
            for item in items:
                days_b = item["days_until"]
                if days_b > 1:
                    suggestions.append(f'Start "{item["title"]}" {min(3, days_b-1)} day(s) early')
            if total_h > 6:
                suggestions.append(f"Total {total_h}h workload is too high — spread across preceding days")
            collisions.append(dict(date=dt, items=items, total_hours=total_h,
                                   suggestions=suggestions))
    return jsonify(collisions)

# ─── Seeder ───────────────────────────────────────────────────────────

def _seed_demo(user_id):
    colors = ["#6c63ff","#38bdf8","#f5a623","#2dd4a0"]
    course_data = [

    ]
    courses = []
    for n,code,cr,col,g,wa,wm,wf in course_data:
        c = Course(user_id=user_id, name=n, code=code, credits=cr, color=col,
                   current_grade=g, w_assignments=wa, w_midterm=wm, w_final=wf)
        db.session.add(c); db.session.flush(); courses.append(c)

    td = date.today()
    def dd(offset): return (td + timedelta(days=offset)).isoformat()

    assignments_data = [
    ]
    for cid,title,typ,due,wt,eh,status,grade,notes,subs in assignments_data:
        a = Assignment(course_id=cid, title=title, type=typ, due_date=due,
                       weight=wt, est_hours=eh, status=status, grade=grade, notes=notes)
        db.session.add(a); db.session.flush()
        for st,done,assignee in subs:
            db.session.add(Subtask(assignment_id=a.id, title=st, done=done, assignee=assignee))
    db.session.commit()

# ─── Init ─────────────────────────────────────────────────────────────

with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
