package board

import java.security.Principal
import java.time.LocalDate
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException

data class TaskInput(val key: UUID, val caseRef: String, val kind: String, val dueDate: LocalDate)
data class Switch(val paused: Boolean)
val kinds = setOf("서류 확인","재연락","상담 검토")
fun fail(status: HttpStatus): Nothing = throw ResponseStatusException(status)

@RestController
@RequestMapping("/api")
class Board(private val db: JdbcTemplate) {
    @GetMapping("/session") fun session(user: Principal, csrf: CsrfToken) =
        mapOf("advisor" to user.name,"csrf" to csrf.token)

    @GetMapping("/board") @Transactional(readOnly=true)
    fun board(user: Principal): Map<String,Any> = mapOf(
        "tasks" to db.queryForList("""select t.id,t.case_ref,t.kind,t.due_date,t.done,o.owner,o.fence,o.sent,
            (i.id is not null) as received from tasks t join outbox o on o.id=t.id
            left join inbox i on i.id=t.id where t.advisor=? order by t.done,t.due_date,t.id""",user.name),
        "events" to db.queryForList("""select e.task_id,e.actor,e.action,e.at,t.case_ref from events e join tasks t
            on t.id=e.task_id where t.advisor=? order by e.seq desc limit 30""",user.name),
        "paused" to (db.queryForList("select paused from switches where advisor=?",Boolean::class.java,user.name).firstOrNull() ?: false)
    )
    @PostMapping("/tasks") @Transactional
    fun save(user: Principal,@RequestBody input: TaskInput): Map<String,UUID> {
        if (!Regex("CASE-[0-9]{3,8}").matches(input.caseRef) || input.kind !in kinds) fail(HttpStatus.BAD_REQUEST)
        val id=UUID.randomUUID()
        val inserted=db.update("""insert into tasks(id,advisor,request_key,case_ref,kind,due_date)
            values(?,?,?,?,?,?) on conflict(advisor,request_key) do nothing""",id,user.name,input.key,input.caseRef,input.kind,input.dueDate)
        if (inserted==0) {
            val prior=db.queryForList("""select id from tasks where advisor=? and request_key=?
                and case_ref=? and kind=? and due_date=?""",UUID::class.java,user.name,input.key,input.caseRef,input.kind,input.dueDate)
            return mapOf("id" to (prior.firstOrNull() ?: fail(HttpStatus.CONFLICT)))
        }
        db.update("insert into outbox(id) values(?)",id)
        db.update("insert into events(task_id,actor,action) values(?,?,?)",id,user.name,"업무 확정 · 알림 접수")
        return mapOf("id" to id)
    }
    @PostMapping("/tasks/{id}/done") fun done(user: Principal,@PathVariable id: UUID) {
        if(db.update("update tasks set done=true where id=? and advisor=?",id,user.name)==0) fail(HttpStatus.NOT_FOUND)
    }
    @PostMapping("/delivery") fun delivery(user: Principal,@RequestBody setting: Switch) {
        db.update("""insert into switches(advisor,paused) values(?,?) on conflict(advisor)
            do update set paused=excluded.paused""",user.name,setting.paused)
    }
}
