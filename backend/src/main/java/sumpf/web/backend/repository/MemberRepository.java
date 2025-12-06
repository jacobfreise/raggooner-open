package sumpf.web.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import sumpf.web.backend.entity.Member;

@Repository
public interface MemberRepository extends JpaRepository<Member, Integer> {
}
