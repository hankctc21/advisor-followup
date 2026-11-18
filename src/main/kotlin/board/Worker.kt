package board

import java.util.UUID
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate

@Component
class Worker(private val db:JdbcTemplate,private val tx:TransactionTemplate) {
    private val name=System.getenv("WORKER_ID").orEmpty()
    private val ackDelay=(System.getenv("ACK_DELAY_MS")?.toLongOrNull() ?: 0L).coerceIn(0,25000)
    data class Claim(val id:UUID,val fence:Long)
    private fun event(id:UUID,message:String) {
        db.update("insert into events(task_id,actor,action) values(?,?,?)",id,name,message)
    }
    @Scheduled(fixedDelay=500)
    fun poll() {
        if(name.isEmpty()) return
        val claim=tx.execute {
            val next=db.query("""with next as (
                select o.id from outbox o join tasks t on t.id=o.id
                left join switches s on s.advisor=t.advisor
                where not o.sent and o.available_at<=now() and not coalesce(s.paused,false)
                order by o.available_at,o.id for update of o skip locked limit 1)
                update outbox o set owner=?, fence=fence+1,available_at=now()+interval '30 seconds'
                from next where o.id=next.id returning o.id,o.fence""",
                { rs, _ -> Claim(rs.getObject(1,UUID::class.java),rs.getLong(2)) },name).firstOrNull()
            if(next!=null) event(next.id,"알림 인수 #"+next.fence)
            next
        } ?: return
        // The simulated receiver commits independently: a crash here can leave an unacknowledged receipt.
        tx.executeWithoutResult {
            val inserted=db.update("insert into inbox(id) values(?) on conflict(id) do nothing",claim.id)
            event(claim.id,if(inserted==1) "수신함 반영" else "기존 수신 확인 · 중복 생략")
        }
        if(ackDelay>0) Thread.sleep(ackDelay)
        tx.executeWithoutResult {
            val updated=db.update("update outbox set sent=true where id=? and owner=? and fence=? and not sent",
                claim.id,name,claim.fence)
            if(updated==1) event(claim.id,"발송 완료 확인")
        }
    }
}
